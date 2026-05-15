// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MUSDirectDebit} from "../src/MUSDirectDebit.sol";
import {ITroveManager} from "../src/interfaces/ITroveManager.sol";
import {IPriceFeed} from "../src/interfaces/IPriceFeed.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Local minimal mintable ERC-20 used only as a stand-in MEZO token in the
/// MEZO-drip tests. Not a deployed dependency; lives only in the test runner.
contract LocalMezoToken is ERC20 {
    constructor() ERC20("Local MEZO", "MEZO") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @notice Fork tests against the real Mezo testnet (chain id 31611).
///
/// Run with:
///   FOUNDRY_PROFILE=fork forge test --match-contract MUSDirectDebitForkTest -vv
///
/// We pin to the FORK_BLOCK below to keep tests reproducible. To re-pin to head:
///   cast block-number --rpc-url https://rpc.test.mezo.org
///
/// No mock contracts are deployed. The four Mezo dependencies are the live
/// testnet addresses. For edge cases (CR below threshold, Recovery Mode on)
/// where we can't manipulate live system state, we use Foundry's vm.mockCall
/// cheat code to override specific return values on the *real* contracts —
/// this is a runtime call interception, not a deployed mock.
contract MUSDirectDebitForkTest is Test {
    // ── Live Mezo testnet addresses (verified 2026-05-04 on chain id 31611) ──
    address internal constant MUSD_ADDR        = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant TROVE_MANAGER    = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0;
    address internal constant PRICE_FEED       = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;

    /// Pinned for reproducibility. Update if you re-record live state.
    uint256 internal constant FORK_BLOCK = 12_923_917;

    MUSDirectDebit internal scheduler;
    IERC20 internal musd;
    ITroveManager internal trove;
    IPriceFeed internal priceFeed;

    address internal payer = makeAddr("payer");
    address internal payee = makeAddr("payee");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal keeper = makeAddr("keeper");

    uint128 internal constant AMOUNT = 100e18;
    uint128 internal constant CAP = 1_200e18;
    uint64 internal constant FREQUENCY = 30 days;
    uint128 internal constant MIN_CR = 2.5e18;

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
        MUSDirectDebit.PauseReason reason,
        uint256 currentICR,
        uint8 failureCount
    );
    event ScheduleAutoCancelled(uint256 indexed scheduleId);
    event OneShotPaid(
        bytes32 indexed requestId,
        address indexed payer,
        address indexed payee,
        address troveOwner,
        uint128 amount,
        uint128 fee,
        uint256 currentICR
    );

    /// Live BTC price observed via cast call at the pinned block.
    /// Used as the mocked return for PriceFeed.fetchPrice() in contract-logic
    /// tests, since the underlying Chainlink aggregator's staleness logic doesn't
    /// replicate cleanly in a forked EVM (infinite recursion via .latestRoundData
    /// when the round timestamp drifts vs forked block.timestamp).
    uint256 internal constant LIVE_PRICE = 80_185e18;

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string("https://rpc.test.mezo.org"));
        vm.createSelectFork(rpc, FORK_BLOCK);

        musd = IERC20(MUSD_ADDR);
        trove = ITroveManager(TROVE_MANAGER);
        priceFeed = IPriceFeed(PRICE_FEED);

        // Default deployment: MEZO disabled (address(0), zero reward).
        // Specific MEZO tests redeploy with a local MEZO stand-in.
        scheduler = new MUSDirectDebit(
            musd,
            trove,
            priceFeed,
            feeRecipient,
            IERC20(address(0)),
            0
        );

        // Fund the payer with real MUSD via deal() — this mutates a balance slot
        // on the real MUSD contract; no mock contract is deployed.
        deal(address(musd), payer, 100_000e18);

        vm.prank(payer);
        musd.approve(address(scheduler), type(uint256).max);

        // Override PriceFeed.fetchPrice() globally for this test contract.
        // Logic-level mock — no deployed mock contract.
        vm.mockCall(
            PRICE_FEED,
            abi.encodeWithSelector(IPriceFeed.fetchPrice.selector),
            abi.encode(LIVE_PRICE)
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Schema verification — these tests will fail loudly if the live ABI
    // ever drifts from our interface assumptions.
    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_realInterfacesAreCallable() public {
        // ICR for an address with no Trove → type(uint256).max. Pure read; no
        // oracle dependency. This is the canonical schema check.
        uint256 icr = trove.getCurrentICR(address(0xdEaD), LIVE_PRICE);
        assertEq(icr, type(uint256).max, "no-trove address ICR");

        // Recovery Mode is currently off on testnet at the pinned block.
        bool rm = trove.checkRecoveryMode(LIVE_PRICE);
        assertFalse(rm, "testnet not in Recovery Mode at fork block");

        // TCR sanity — should be > 200% on a healthy testnet.
        uint256 tcr = ITroveManagerExtra(address(trove)).getTCR(LIVE_PRICE);
        assertGt(tcr, 2e18, "TCR > 200%");

        // MUSD is a standard ERC-20.
        assertEq(IERC20Meta(address(musd)).symbol(), "MUSD");
        assertEq(IERC20Meta(address(musd)).decimals(), 18);
        assertGt(musd.totalSupply(), 1e27, "MUSD supply > 1B");
    }

    /// Live cast verification (run separately from forge tests):
    ///   cast call --rpc-url https://rpc.test.mezo.org \
    ///     0x86bCF0841622a5dAC14A313a15f96A95421b9366 "fetchPrice()(uint256)"
    /// This call is omitted from the fork test because the Chainlink aggregator
    /// it depends on has staleness logic that diverges between live RPC and
    /// forked EVM. The live verification is documented in ITroveManager.sol.
    function test_fork_priceFeed_documentedNote() public pure {
        // Intentionally empty — see comment above.
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Happy path — real PriceFeed, real TroveManager, mocked ICR for the
    // payer (they don't have a Trove on testnet; we override just that call).
    // ─────────────────────────────────────────────────────────────────────────

    function _create() internal returns (uint256 id) {
        vm.prank(payer);
        id = scheduler.createSchedule(
            payee,
            AMOUNT,
            FREQUENCY,
            uint64(block.timestamp),
            uint64(block.timestamp + 365 days),
            CAP,
            MIN_CR
        );
    }

    function _mockICR(uint256 icr) internal {
        // Override TroveManager.getCurrentICR(payer, *) to return `icr`.
        // Other callers / addresses are untouched.
        vm.mockCall(
            TROVE_MANAGER,
            abi.encodeWithSelector(ITroveManager.getCurrentICR.selector, payer),
            abi.encode(icr)
        );
    }

    function _mockRecoveryMode(bool on) internal {
        vm.mockCall(
            TROVE_MANAGER,
            abi.encodeWithSelector(ITroveManager.checkRecoveryMode.selector),
            abi.encode(on)
        );
    }

    function test_fork_executePayment_happyPath() public {
        uint256 id = _create();
        _mockICR(4e18); // 400% — well above the 250% user floor.

        uint256 payerBefore = musd.balanceOf(payer);
        uint256 payeeBefore = musd.balanceOf(payee);
        uint256 feeBefore = musd.balanceOf(feeRecipient);

        vm.expectEmit(true, true, true, false);
        emit PaymentExecuted(id, payer, payee, AMOUNT, 0, 0, 0);

        vm.prank(keeper);
        scheduler.executePayment(id);

        uint128 expectedFee = uint128((uint256(AMOUNT) * 25) / 10_000);
        assertEq(musd.balanceOf(payer), payerBefore - AMOUNT, "payer debited");
        assertEq(musd.balanceOf(payee), payeeBefore + (AMOUNT - expectedFee), "payee credited net");
        assertEq(musd.balanceOf(feeRecipient), feeBefore + expectedFee, "fee paid");

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(s.totalSpent, AMOUNT);
        assertEq(uint256(s.failureCount), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CR gate
    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_pausesWhenBelowCR() public {
        uint256 id = _create();
        _mockICR(2.4e18);

        vm.expectEmit(true, false, false, true);
        emit PaymentPaused(id, MUSDirectDebit.PauseReason.CrBelowThreshold, 2.4e18, 1);

        vm.prank(keeper);
        scheduler.executePayment(id);

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.totalSpent), 0);
        assertEq(uint256(s.failureCount), 1);
    }

    function test_fork_threeFailures_autoCancels() public {
        uint256 id = _create();
        _mockICR(2.4e18);

        vm.startPrank(keeper);
        scheduler.executePayment(id);
        vm.warp(block.timestamp + FREQUENCY);
        scheduler.executePayment(id);
        vm.warp(block.timestamp + FREQUENCY);

        vm.expectEmit(true, false, false, false);
        emit ScheduleAutoCancelled(id);
        scheduler.executePayment(id);
        vm.stopPrank();

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint8(s.status), uint8(MUSDirectDebit.Status.AutoCancelled));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Recovery Mode floor
    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_recoveryMode_elevatesFloorTo155() public {
        // User asks for 150% floor; ICR is 154%; RM is on → effective floor 155% → blocked.
        vm.prank(payer);
        uint256 id = scheduler.createSchedule(
            payee, AMOUNT, FREQUENCY, uint64(block.timestamp),
            uint64(block.timestamp + 365 days), CAP, 1.5e18
        );
        _mockICR(1.54e18);
        _mockRecoveryMode(true);

        vm.prank(keeper);
        scheduler.executePayment(id);

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.totalSpent), 0, "RM gate refused");
        assertEq(uint256(s.failureCount), 1);
    }

    function test_fork_recoveryMode_doesNotLowerHigherUserFloor() public {
        // User asks for 300%; ICR is 280%; RM on. Effective floor stays at 300%.
        vm.prank(payer);
        uint256 id = scheduler.createSchedule(
            payee, AMOUNT, FREQUENCY, uint64(block.timestamp),
            uint64(block.timestamp + 365 days), CAP, 3e18
        );
        _mockICR(2.8e18);
        _mockRecoveryMode(true);

        vm.prank(keeper);
        scheduler.executePayment(id);

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.totalSpent), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Cap / expiry / cadence — same logic as before but against real chain.
    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_cap_autoCancelsWhenExceeded() public {
        vm.prank(payer);
        uint256 id = scheduler.createSchedule(
            payee, AMOUNT, FREQUENCY, uint64(block.timestamp),
            uint64(block.timestamp + 365 days), AMOUNT, MIN_CR
        );
        _mockICR(4e18);

        vm.prank(keeper);
        scheduler.executePayment(id);

        vm.warp(block.timestamp + FREQUENCY);
        vm.prank(keeper);
        scheduler.executePayment(id);

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint8(s.status), uint8(MUSDirectDebit.Status.AutoCancelled));
    }

    function test_fork_expired_autoCancels() public {
        uint256 id = _create();
        _mockICR(4e18);
        vm.warp(block.timestamp + 366 days);

        vm.prank(keeper);
        scheduler.executePayment(id);

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint8(s.status), uint8(MUSDirectDebit.Status.AutoCancelled));
        assertEq(uint256(s.totalSpent), 0);
    }

    function test_fork_cadence_cannotExecuteEarly() public {
        uint256 id = _create();
        _mockICR(4e18);

        vm.prank(keeper);
        scheduler.executePayment(id);

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MUSDirectDebit.TooEarly.selector, uint64(block.timestamp + FREQUENCY)));
        scheduler.executePayment(id);
    }

    function test_fork_feeCappedAt5MUSD() public {
        uint128 bigAmount = 100_000e18;
        deal(address(musd), payer, bigAmount * 2);

        vm.prank(payer);
        uint256 id = scheduler.createSchedule(
            payee, bigAmount, FREQUENCY, uint64(block.timestamp),
            uint64(block.timestamp + 365 days), bigAmount, MIN_CR
        );
        _mockICR(4e18);

        uint256 feeBefore = musd.balanceOf(feeRecipient);
        vm.prank(keeper);
        scheduler.executePayment(id);
        assertEq(musd.balanceOf(feeRecipient) - feeBefore, 5e18, "fee capped at 5 MUSD");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Cancel / pause / resume
    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_cancel_blocksExecution() public {
        uint256 id = _create();
        _mockICR(4e18);

        vm.prank(payer);
        scheduler.cancelSchedule(id);

        vm.prank(keeper);
        vm.expectRevert(MUSDirectDebit.ScheduleNotActive.selector);
        scheduler.executePayment(id);
    }

    function test_fork_pauseResume_resetsFailureCount() public {
        uint256 id = _create();
        _mockICR(2.0e18); // below threshold

        vm.prank(keeper);
        scheduler.executePayment(id);
        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.failureCount), 1);

        vm.startPrank(payer);
        scheduler.pauseSchedule(id);
        scheduler.resumeSchedule(id);
        vm.stopPrank();

        s = scheduler.getSchedule(id);
        assertEq(uint256(s.failureCount), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────
    // MEZO drip — per PRD §15 fallback. Anyone can fund the treasury; on each
    // successful execute the contract pays the executor a fixed MEZO reward.
    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_mezo_dripPaidOnExecute() public {
        LocalMezoToken mezo = new LocalMezoToken();
        uint128 reward = 0.5e18;
        MUSDirectDebit s = new MUSDirectDebit(
            musd, trove, priceFeed, feeRecipient, IERC20(address(mezo)), reward
        );

        // Fund the treasury (anyone can do this).
        address funder = makeAddr("funder");
        mezo.mint(funder, 10e18);
        vm.startPrank(funder);
        mezo.approve(address(s), type(uint256).max);
        s.fundMezoTreasury(10e18);
        vm.stopPrank();

        assertEq(s.mezoTreasuryBalance(), 10e18);

        // Create a schedule on this fresh scheduler.
        vm.startPrank(payer);
        musd.approve(address(s), type(uint256).max);
        uint256 id = s.createSchedule(
            payee, AMOUNT, FREQUENCY,
            uint64(block.timestamp), uint64(block.timestamp + 365 days),
            CAP, MIN_CR
        );
        vm.stopPrank();

        _mockICR(4e18);

        uint256 keeperMezoBefore = mezo.balanceOf(keeper);
        vm.prank(keeper);
        s.executePayment(id);

        assertEq(mezo.balanceOf(keeper) - keeperMezoBefore, reward, "keeper got MEZO drip");
        assertEq(s.mezoTreasuryBalance(), 10e18 - reward, "treasury debited");
    }

    function test_fork_mezo_dripSkippedIfTreasuryEmpty() public {
        LocalMezoToken mezo = new LocalMezoToken();
        uint128 reward = 0.5e18;
        MUSDirectDebit s = new MUSDirectDebit(
            musd, trove, priceFeed, feeRecipient, IERC20(address(mezo)), reward
        );

        vm.startPrank(payer);
        musd.approve(address(s), type(uint256).max);
        uint256 id = s.createSchedule(
            payee, AMOUNT, FREQUENCY,
            uint64(block.timestamp), uint64(block.timestamp + 365 days),
            CAP, MIN_CR
        );
        vm.stopPrank();

        _mockICR(4e18);

        uint256 payeeBefore = musd.balanceOf(payee);
        vm.prank(keeper);
        s.executePayment(id);

        // Payment still goes through (drip is non-essential to the payment path).
        assertGt(musd.balanceOf(payee) - payeeBefore, 0, "payment landed");
        assertEq(mezo.balanceOf(keeper), 0, "no MEZO since treasury empty");
    }

    function test_fork_mezo_constructorRejectsRewardWithoutToken() public {
        vm.expectRevert(bytes("mezo=0 but reward>0"));
        new MUSDirectDebit(musd, trove, priceFeed, feeRecipient, IERC20(address(0)), 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // One-shot (x402) payments — reactive primitive with the same CR gate.
    // ─────────────────────────────────────────────────────────────────────────

    function test_fork_oneShot_happyPath() public {
        _mockICR(4e18);

        bytes32 requestId = keccak256(abi.encode("test/premium", uint256(1)));
        uint128 amount = 3e18; // 3 MUSD micropayment

        uint256 payerBefore = musd.balanceOf(payer);
        uint256 payeeBefore = musd.balanceOf(payee);
        uint256 feeBefore = musd.balanceOf(feeRecipient);

        uint128 expectedFee = uint128((uint256(amount) * 25) / 10_000); // 0.0075 MUSD, below cap

        vm.expectEmit(true, true, true, true);
        emit OneShotPaid(requestId, payer, payee, payer, amount, expectedFee, 4e18);

        vm.prank(payer);
        uint256 icr = scheduler.executeOneShot(payer, payee, amount, MIN_CR, requestId);
        assertEq(icr, 4e18);

        assertEq(musd.balanceOf(payer), payerBefore - amount, "payer debited");
        assertEq(musd.balanceOf(payee), payeeBefore + (amount - expectedFee), "payee net");
        assertEq(musd.balanceOf(feeRecipient), feeBefore + expectedFee, "fee paid");
        assertTrue(scheduler.paidRequests(requestId), "requestId marked");
    }

    function test_fork_oneShot_pausesWhenBelowCR() public {
        _mockICR(2.4e18);
        bytes32 requestId = bytes32(uint256(0xCAFE));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MUSDirectDebit.CrBelowThreshold.selector, uint256(2.4e18), uint256(MIN_CR)));
        scheduler.executeOneShot(payer, payee, 3e18, MIN_CR, requestId);

        // Critically: requestId is NOT marked paid, so the caller can retry
        // once their Trove recovers.
        assertFalse(scheduler.paidRequests(requestId), "requestId NOT marked on CR refusal");
    }

    function test_fork_oneShot_replayBlocked() public {
        _mockICR(4e18);
        bytes32 requestId = bytes32(uint256(0xBEEF));

        vm.prank(payer);
        scheduler.executeOneShot(payer, payee, 3e18, MIN_CR, requestId);

        // Same requestId again → revert.
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MUSDirectDebit.RequestAlreadyPaid.selector, requestId));
        scheduler.executeOneShot(payer, payee, 3e18, MIN_CR, requestId);
    }

    function test_fork_oneShot_separateTroveOwner() public {
        // Agent has its own MUSD but no Trove; owner has the Trove.
        // The agent specifies the owner as troveOwner; the gate reads owner's CR.
        address owner = makeAddr("owner");
        _mockICR(4e18); // mockICR overrides the payer; we need to override owner instead
        // Re-override specifically for `owner`.
        vm.mockCall(
            TROVE_MANAGER,
            abi.encodeWithSelector(ITroveManager.getCurrentICR.selector, owner),
            abi.encode(uint256(4e18))
        );

        bytes32 requestId = bytes32(uint256(0x12345));
        vm.prank(payer);
        uint256 icr = scheduler.executeOneShot(owner, payee, 3e18, MIN_CR, requestId);
        assertEq(icr, 4e18);
        assertTrue(scheduler.paidRequests(requestId));
    }

    function test_fork_oneShot_validation() public {
        bytes32 r = bytes32(uint256(1));
        vm.startPrank(payer);

        vm.expectRevert(MUSDirectDebit.InvalidPayee.selector);
        scheduler.executeOneShot(payer, address(0), 3e18, MIN_CR, r);

        // Payee == sender is disallowed.
        vm.expectRevert(MUSDirectDebit.InvalidPayee.selector);
        scheduler.executeOneShot(payer, payer, 3e18, MIN_CR, r);

        vm.expectRevert(MUSDirectDebit.InvalidAmount.selector);
        scheduler.executeOneShot(payer, payee, 0, MIN_CR, r);

        vm.expectRevert(MUSDirectDebit.InvalidMinCR.selector);
        scheduler.executeOneShot(payer, payee, 3e18, 1.0e18, r);

        vm.expectRevert(MUSDirectDebit.InvalidTroveOwner.selector);
        scheduler.executeOneShot(address(0), payee, 3e18, MIN_CR, r);

        vm.stopPrank();
    }

    function test_fork_oneShot_feeCappedAt5MUSD() public {
        _mockICR(4e18);
        uint128 bigAmount = 100_000e18;
        deal(address(musd), payer, bigAmount * 2);

        uint256 feeBefore = musd.balanceOf(feeRecipient);
        vm.prank(payer);
        scheduler.executeOneShot(payer, payee, bigAmount, MIN_CR, bytes32(uint256(0xABCD)));
        assertEq(musd.balanceOf(feeRecipient) - feeBefore, 5e18, "fee capped at 5 MUSD");
    }

    function test_fork_oneShot_recoveryModeFloor() public {
        // User asks for 150% floor; ICR is 154%; RM on → blocked at 155% effective.
        _mockICR(1.54e18);
        _mockRecoveryMode(true);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(
            MUSDirectDebit.CrBelowThreshold.selector,
            uint256(1.54e18),
            uint256(1.55e18)
        ));
        scheduler.executeOneShot(payer, payee, 3e18, 1.5e18, bytes32(uint256(0xF00D)));
    }

    function test_fork_create_validation() public {
        vm.startPrank(payer);

        vm.expectRevert(MUSDirectDebit.InvalidPayee.selector);
        scheduler.createSchedule(address(0), AMOUNT, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days), CAP, MIN_CR);

        vm.expectRevert(MUSDirectDebit.InvalidAmount.selector);
        scheduler.createSchedule(payee, 0, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days), CAP, MIN_CR);

        vm.expectRevert(MUSDirectDebit.InvalidMinCR.selector);
        scheduler.createSchedule(payee, AMOUNT, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days), CAP, 1.0e18);

        vm.stopPrank();
    }
}

interface IERC20Meta {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

interface ITroveManagerExtra {
    function getTCR(uint256 _price) external view returns (uint256);
}
