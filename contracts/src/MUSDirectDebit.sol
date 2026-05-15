// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ITroveManager} from "./interfaces/ITroveManager.sol";
import {IPriceFeed} from "./interfaces/IPriceFeed.sol";

/// @title MUSDirectDebit — collateral-aware recurring MUSD payments on Mezo.
/// @notice Auto-pay rent / SaaS / payroll in MUSD. Every execution reads the
/// payer's Trove ICR first and refuses payments that would push them toward liquidation.
contract MUSDirectDebit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Recovery Mode floor — when global TCR < 150%, scheduler floor is at least 155%.
    uint256 public constant RECOVERY_MODE_FLOOR = 1.55e18;

    /// @notice Auto-cancel after this many consecutive failed executions.
    uint256 public constant MAX_CONSECUTIVE_FAILURES = 3;

    /// @notice Per-execution fee, in basis points of the payment amount (25 bps = 0.25%).
    uint256 public constant FEE_BPS = 25;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Per-execution fee cap, in MUSD units (5 MUSD).
    uint256 public constant FEE_CAP = 5e18;

    // ─────────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────────

    enum Status {
        Active,
        Paused,
        Cancelled,
        AutoCancelled
    }

    enum PauseReason {
        None,
        CrBelowThreshold,
        CapExceeded,
        Expired,
        AutoCancelled
    }

    struct Schedule {
        address payer;
        address payee;
        uint128 amount;          // MUSD units (1e18)
        uint128 totalSpent;      // MUSD units cumulative
        uint128 totalSpentCap;   // MUSD units max lifetime spend
        uint64 frequency;        // seconds between executions
        uint64 nextExec;         // unix timestamp of next eligible execution
        uint64 expiry;           // unix timestamp after which schedule cannot execute
        uint128 minSafeCR;       // user's CR floor, scaled by 1e18 (250% = 2.5e18)
        Status status;
        uint8 failureCount;      // consecutive CR-failures since last success
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────────

    IERC20 public immutable musd;
    ITroveManager public immutable troveManager;
    IPriceFeed public immutable priceFeed;
    address public immutable feeRecipient;

    /// @notice Optional MEZO token. When non-zero, the contract pays a MEZO
    /// "drip" to the executor on every successful execution out of its own
    /// MEZO balance. Anyone can replenish via `fundMezoTreasury`.
    /// This is the PRD §15 documented fallback for MEZO integration:
    /// "keeper-rewards-in-MEZO from a pre-funded treasury." If gauge
    /// registration becomes available later, the gauge can be funded into
    /// this treasury without redeploying.
    IERC20 public immutable mezo;
    uint128 public immutable mezoRewardPerExec;

    uint256 public nextScheduleId = 1;
    mapping(uint256 => Schedule) public schedules;

    /// One-shot (x402) replay protection. Each `requestId` issued by an API
    /// server's middleware can settle exactly one payment on-chain. A failed
    /// CR check does NOT mark the requestId paid, so the payer can retry
    /// later once their Trove recovers.
    mapping(bytes32 => bool) public paidRequests;

    // ─────────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────────

    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed payer,
        address indexed payee,
        uint128 amount,
        uint64 frequency,
        uint64 nextExec,
        uint64 expiry,
        uint128 totalSpentCap,
        uint128 minSafeCR
    );
    event PaymentExecuted(
        uint256 indexed scheduleId,
        address indexed payer,
        address indexed payee,
        uint128 amount,
        uint128 fee,
        uint256 currentICR,
        uint64 nextExec
    );
    event PaymentPaused(
        uint256 indexed scheduleId,
        PauseReason reason,
        uint256 currentICR,
        uint8 failureCount
    );
    event ScheduleCancelled(uint256 indexed scheduleId, address indexed by);
    event SchedulePaused(uint256 indexed scheduleId, address indexed by);
    event ScheduleResumed(uint256 indexed scheduleId, address indexed by, uint64 nextExec);
    event ScheduleAutoCancelled(uint256 indexed scheduleId);
    event MezoTreasuryFunded(address indexed by, uint256 amount);
    event MezoRewardPaid(uint256 indexed scheduleId, address indexed to, uint256 amount);
    /// One-shot (x402) payment. scheduleId is set to 0 in MezoRewardPaid for
    /// the corresponding MEZO drip so off-chain indexers can distinguish.
    event OneShotPaid(
        bytes32 indexed requestId,
        address indexed payer,
        address indexed payee,
        address troveOwner,
        uint128 amount,
        uint128 fee,
        uint256 currentICR
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────────

    error InvalidAmount();
    error InvalidFrequency();
    error InvalidExpiry();
    error InvalidPayee();
    error InvalidMinCR();
    error InvalidTroveOwner();
    error CapBelowFirstPayment();
    error UnknownSchedule();
    error NotScheduleOwner();
    error ScheduleNotActive();
    error TooEarly(uint64 nextExec);
    error AlreadyExpired();
    error CapExceeded();
    error CrBelowThreshold(uint256 currentICR, uint256 effectiveMinCR);
    error RequestAlreadyPaid(bytes32 requestId);

    // ─────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────────

    constructor(
        IERC20 _musd,
        ITroveManager _troveManager,
        IPriceFeed _priceFeed,
        address _feeRecipient,
        IERC20 _mezo,
        uint128 _mezoRewardPerExec
    ) {
        require(address(_musd) != address(0), "musd=0");
        require(address(_troveManager) != address(0), "trove=0");
        require(address(_priceFeed) != address(0), "priceFeed=0");
        require(_feeRecipient != address(0), "feeRecipient=0");
        // _mezo == address(0) is allowed and disables the MEZO drip entirely.
        // _mezoRewardPerExec must be zero when _mezo is unset, for clarity.
        require(address(_mezo) != address(0) || _mezoRewardPerExec == 0, "mezo=0 but reward>0");
        musd = _musd;
        troveManager = _troveManager;
        priceFeed = _priceFeed;
        feeRecipient = _feeRecipient;
        mezo = _mezo;
        mezoRewardPerExec = _mezoRewardPerExec;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // MEZO treasury — open-funded, drips to keepers on every successful execute.
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Top up the MEZO reward treasury. Anyone may call. No-op if MEZO is unset.
    /// @dev Pulls `amount` MEZO from the caller via transferFrom; caller must approve first.
    function fundMezoTreasury(uint256 amount) external {
        require(address(mezo) != address(0), "no mezo");
        if (amount == 0) return;
        mezo.safeTransferFrom(msg.sender, address(this), amount);
        emit MezoTreasuryFunded(msg.sender, amount);
    }

    /// @notice Current MEZO balance held by the scheduler. Used by keepers to
    /// decide whether to bother polling.
    function mezoTreasuryBalance() external view returns (uint256) {
        if (address(mezo) == address(0)) return 0;
        return mezo.balanceOf(address(this));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Create a recurring payment schedule. Caller becomes the payer.
    /// @dev Caller must have a sufficient MUSD allowance to MUSDirectDebit covering totalSpentCap.
    function createSchedule(
        address payee,
        uint128 amount,
        uint64 frequency,
        uint64 firstExec,
        uint64 expiry,
        uint128 totalSpentCap,
        uint128 minSafeCR
    ) external returns (uint256 scheduleId) {
        if (payee == address(0) || payee == msg.sender) revert InvalidPayee();
        if (amount == 0) revert InvalidAmount();
        if (frequency == 0) revert InvalidFrequency();
        if (expiry <= block.timestamp || expiry <= firstExec) revert InvalidExpiry();
        if (firstExec < block.timestamp) firstExec = uint64(block.timestamp);
        if (totalSpentCap < amount) revert CapBelowFirstPayment();
        // 110% absolute floor — a CDP user with CR<110% is already past liquidation.
        if (minSafeCR < 1.1e18) revert InvalidMinCR();

        scheduleId = nextScheduleId++;
        schedules[scheduleId] = Schedule({
            payer: msg.sender,
            payee: payee,
            amount: amount,
            totalSpent: 0,
            totalSpentCap: totalSpentCap,
            frequency: frequency,
            nextExec: firstExec,
            expiry: expiry,
            minSafeCR: minSafeCR,
            status: Status.Active,
            failureCount: 0
        });

        emit ScheduleCreated(
            scheduleId,
            msg.sender,
            payee,
            amount,
            frequency,
            firstExec,
            expiry,
            totalSpentCap,
            minSafeCR
        );
    }

    /// @notice Permanent cancel — callable only by the payer.
    function cancelSchedule(uint256 scheduleId) external {
        Schedule storage s = _mustExist(scheduleId);
        if (s.payer != msg.sender) revert NotScheduleOwner();
        if (s.status == Status.Cancelled || s.status == Status.AutoCancelled) revert ScheduleNotActive();
        s.status = Status.Cancelled;
        emit ScheduleCancelled(scheduleId, msg.sender);
    }

    /// @notice Temporary pause — callable only by the payer. Resumable later.
    function pauseSchedule(uint256 scheduleId) external {
        Schedule storage s = _mustExist(scheduleId);
        if (s.payer != msg.sender) revert NotScheduleOwner();
        if (s.status != Status.Active) revert ScheduleNotActive();
        s.status = Status.Paused;
        emit SchedulePaused(scheduleId, msg.sender);
    }

    /// @notice Resume from pause. Sets nextExec to max(now, prior nextExec).
    function resumeSchedule(uint256 scheduleId) external {
        Schedule storage s = _mustExist(scheduleId);
        if (s.payer != msg.sender) revert NotScheduleOwner();
        if (s.status != Status.Paused) revert ScheduleNotActive();
        s.status = Status.Active;
        if (s.nextExec < block.timestamp) s.nextExec = uint64(block.timestamp);
        s.failureCount = 0;
        emit ScheduleResumed(scheduleId, msg.sender, s.nextExec);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Execution
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Execute a due payment. P0 keeper-callable; P2 will be permissionless with caller fee.
    /// @dev Reads TroveManager + PriceFeed + Recovery Mode and gates accordingly.
    function executePayment(uint256 scheduleId) external nonReentrant {
        Schedule storage s = _mustExist(scheduleId);
        if (s.status != Status.Active) revert ScheduleNotActive();
        if (block.timestamp < s.nextExec) revert TooEarly(s.nextExec);

        // Expired schedules pause permanently (no further keeper calls expected).
        if (block.timestamp > s.expiry) {
            s.status = Status.AutoCancelled;
            emit PaymentPaused(scheduleId, PauseReason.Expired, 0, s.failureCount);
            emit ScheduleAutoCancelled(scheduleId);
            return;
        }

        // Cap check happens before any external calls.
        uint128 newTotal = s.totalSpent + s.amount;
        if (newTotal > s.totalSpentCap) {
            s.status = Status.AutoCancelled;
            emit PaymentPaused(scheduleId, PauseReason.CapExceeded, 0, s.failureCount);
            emit ScheduleAutoCancelled(scheduleId);
            return;
        }

        // CR gate. PriceFeed.fetchPrice() updates state, hence non-view.
        uint256 price = priceFeed.fetchPrice();
        uint256 currentICR = troveManager.getCurrentICR(s.payer, price);
        bool recoveryMode = troveManager.checkRecoveryMode(price);

        uint256 effectiveMinCR = s.minSafeCR;
        if (recoveryMode && effectiveMinCR < RECOVERY_MODE_FLOOR) {
            effectiveMinCR = RECOVERY_MODE_FLOOR;
        }

        if (currentICR < effectiveMinCR) {
            uint8 newFailureCount = s.failureCount + 1;
            s.failureCount = newFailureCount;
            emit PaymentPaused(scheduleId, PauseReason.CrBelowThreshold, currentICR, newFailureCount);
            if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
                s.status = Status.AutoCancelled;
                emit ScheduleAutoCancelled(scheduleId);
            }
            return;
        }

        // Update accounting before transfers.
        s.totalSpent = newTotal;
        s.failureCount = 0;
        // Round nextExec forward by one period from the prior schedule slot, not from now,
        // so periodic schedules stay on a stable cadence even if the keeper is late.
        uint64 advanced = s.nextExec + s.frequency;
        if (advanced < block.timestamp) advanced = uint64(block.timestamp) + s.frequency;
        s.nextExec = advanced;

        // Fee math. Cast is safe: amount fits in uint128, *25/10000 strictly shrinks.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 fee = uint128((uint256(s.amount) * FEE_BPS) / BPS_DENOMINATOR);
        // FEE_CAP = 5e18 ≪ 2^128. Cast is safe.
        // forge-lint: disable-next-line(unsafe-typecast)
        if (fee > FEE_CAP) fee = uint128(FEE_CAP);
        uint128 netToPayee = s.amount - fee;

        // Pulls + pays.
        musd.safeTransferFrom(s.payer, s.payee, netToPayee);
        if (fee > 0) {
            musd.safeTransferFrom(s.payer, feeRecipient, fee);
        }

        emit PaymentExecuted(scheduleId, s.payer, s.payee, s.amount, fee, currentICR, s.nextExec);

        // MEZO drip — only if configured AND treasury has at least one reward's worth.
        // Uses balanceOf rather than reverting to keep the happy path resilient
        // when the treasury empties out (keeper just stops earning until refunded).
        if (address(mezo) != address(0) && mezoRewardPerExec > 0) {
            uint256 reward = mezoRewardPerExec;
            if (mezo.balanceOf(address(this)) >= reward) {
                mezo.safeTransfer(msg.sender, reward);
                emit MezoRewardPaid(scheduleId, msg.sender, reward);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // One-shot (x402) — reactive payment with the same CR gate.
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Pay `amount` MUSD to `payee` exactly once, gated on `troveOwner`'s
    /// collateral ratio. Used by the x402 server middleware (the at-musdirect
    /// slash x402 npm package) to settle pay-per-request micropayments.
    ///
    /// @dev `msg.sender` is the payer and must have approved this contract for
    /// at least `amount` MUSD. `troveOwner` is the address whose Trove ICR
    /// gates the payment — it can equal `msg.sender` (agent with its own
    /// Trove) or differ (agent's human owner gates the agent's spending).
    ///
    /// Reverts with `CrBelowThreshold` if the gate fails. The replay-protection
    /// mapping is NOT marked when reverting — the payer can retry once their
    /// Trove recovers, with the same `requestId`.
    function executeOneShot(
        address troveOwner,
        address payee,
        uint128 amount,
        uint128 minSafeCR,
        bytes32 requestId
    ) external nonReentrant returns (uint256 currentICR) {
        if (paidRequests[requestId]) revert RequestAlreadyPaid(requestId);
        if (payee == address(0) || payee == msg.sender) revert InvalidPayee();
        if (amount == 0) revert InvalidAmount();
        if (minSafeCR < 1.1e18) revert InvalidMinCR();
        if (troveOwner == address(0)) revert InvalidTroveOwner();

        // CR gate — identical semantics to executePayment.
        uint256 price = priceFeed.fetchPrice();
        currentICR = troveManager.getCurrentICR(troveOwner, price);
        bool recoveryMode = troveManager.checkRecoveryMode(price);

        uint256 effectiveMinCR = minSafeCR;
        if (recoveryMode && effectiveMinCR < RECOVERY_MODE_FLOOR) {
            effectiveMinCR = RECOVERY_MODE_FLOOR;
        }
        if (currentICR < effectiveMinCR) {
            revert CrBelowThreshold(currentICR, effectiveMinCR);
        }

        // CEI: mark the requestId paid before pulling MUSD.
        paidRequests[requestId] = true;

        // Fee math — same shape as executePayment.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 fee = uint128((uint256(amount) * FEE_BPS) / BPS_DENOMINATOR);
        // forge-lint: disable-next-line(unsafe-typecast)
        if (fee > FEE_CAP) fee = uint128(FEE_CAP);
        uint128 netToPayee = amount - fee;

        musd.safeTransferFrom(msg.sender, payee, netToPayee);
        if (fee > 0) {
            musd.safeTransferFrom(msg.sender, feeRecipient, fee);
        }

        emit OneShotPaid(requestId, msg.sender, payee, troveOwner, amount, fee, currentICR);

        // MEZO drip — same as the scheduled path, but tagged with scheduleId=0
        // so consumers can distinguish recurring from reactive.
        if (address(mezo) != address(0) && mezoRewardPerExec > 0) {
            uint256 reward = mezoRewardPerExec;
            if (mezo.balanceOf(address(this)) >= reward) {
                mezo.safeTransfer(msg.sender, reward);
                emit MezoRewardPaid(0, msg.sender, reward);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────────

    function getSchedule(uint256 scheduleId) external view returns (Schedule memory) {
        return schedules[scheduleId];
    }

    /// @notice Returns true if executePayment(scheduleId) would advance state right now.
    /// @dev Cheaper preflight for keepers to skip ineligible schedules without sending a tx.
    function isDue(uint256 scheduleId) external view returns (bool) {
        Schedule storage s = schedules[scheduleId];
        if (s.payer == address(0)) return false;
        if (s.status != Status.Active) return false;
        if (block.timestamp < s.nextExec) return false;
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────────

    function _mustExist(uint256 scheduleId) internal view returns (Schedule storage) {
        Schedule storage s = schedules[scheduleId];
        if (s.payer == address(0)) revert UnknownSchedule();
        return s;
    }
}
