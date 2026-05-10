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

    uint256 public nextScheduleId = 1;
    mapping(uint256 => Schedule) public schedules;

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

    // ─────────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────────

    error InvalidAmount();
    error InvalidFrequency();
    error InvalidExpiry();
    error InvalidPayee();
    error InvalidMinCR();
    error CapBelowFirstPayment();
    error UnknownSchedule();
    error NotScheduleOwner();
    error ScheduleNotActive();
    error TooEarly(uint64 nextExec);
    error AlreadyExpired();
    error CapExceeded();
    error CrBelowThreshold(uint256 currentICR, uint256 effectiveMinCR);

    // ─────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────────

    constructor(
        IERC20 _musd,
        ITroveManager _troveManager,
        IPriceFeed _priceFeed,
        address _feeRecipient
    ) {
        require(address(_musd) != address(0), "musd=0");
        require(address(_troveManager) != address(0), "trove=0");
        require(address(_priceFeed) != address(0), "priceFeed=0");
        require(_feeRecipient != address(0), "feeRecipient=0");
        musd = _musd;
        troveManager = _troveManager;
        priceFeed = _priceFeed;
        feeRecipient = _feeRecipient;
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
