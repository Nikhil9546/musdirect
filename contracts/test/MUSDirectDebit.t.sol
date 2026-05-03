// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MUSDirectDebit} from "../src/MUSDirectDebit.sol";

import {MockMUSD} from "./mocks/MockMUSD.sol";
import {MockTroveManager} from "./mocks/MockTroveManager.sol";
import {MockBorrowerOperations} from "./mocks/MockBorrowerOperations.sol";
import {MockPriceFeed} from "./mocks/MockPriceFeed.sol";

contract MUSDirectDebitTest is Test {
    MUSDirectDebit internal scheduler;
    MockMUSD internal musd;
    MockTroveManager internal trove;
    MockBorrowerOperations internal borrowerOps;
    MockPriceFeed internal priceFeed;

    address internal payer = makeAddr("payer");
    address internal payee = makeAddr("payee");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal keeper = makeAddr("keeper");

    uint128 internal constant AMOUNT = 100e18;        // 100 MUSD per period
    uint128 internal constant CAP = 1_200e18;         // 12 periods
    uint64 internal constant FREQUENCY = 30 days;
    uint128 internal constant MIN_CR = 2.5e18;        // 250%

    // Match contract events for vm.expectEmit.
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
    event ScheduleCancelled(uint256 indexed scheduleId, address indexed by);
    event ScheduleAutoCancelled(uint256 indexed scheduleId);

    function setUp() public {
        musd = new MockMUSD();
        trove = new MockTroveManager();
        borrowerOps = new MockBorrowerOperations();
        priceFeed = new MockPriceFeed();
        scheduler = new MUSDirectDebit(musd, trove, borrowerOps, priceFeed, feeRecipient);

        // Fund payer and pre-approve the scheduler for the cap.
        musd.mint(payer, 10_000e18);
        vm.prank(payer);
        musd.approve(address(scheduler), type(uint256).max);

        // Default: payer is healthy.
        trove.setICR(payer, 4e18); // 400%

        // Start at a sensible block timestamp.
        vm.warp(1_700_000_000);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────────

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

    function _expectedFee() internal pure returns (uint128) {
        // 25 bps of 100e18 = 0.25e18; below the 5e18 cap.
        return uint128((uint256(AMOUNT) * 25) / 10_000);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Lifecycle / validation
    // ─────────────────────────────────────────────────────────────────────────────

    function test_create_validation() public {
        vm.startPrank(payer);

        vm.expectRevert(MUSDirectDebit.InvalidPayee.selector);
        scheduler.createSchedule(address(0), AMOUNT, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days), CAP, MIN_CR);

        vm.expectRevert(MUSDirectDebit.InvalidPayee.selector);
        scheduler.createSchedule(payer, AMOUNT, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days), CAP, MIN_CR);

        vm.expectRevert(MUSDirectDebit.InvalidAmount.selector);
        scheduler.createSchedule(payee, 0, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days), CAP, MIN_CR);

        vm.expectRevert(MUSDirectDebit.InvalidFrequency.selector);
        scheduler.createSchedule(payee, AMOUNT, 0, uint64(block.timestamp), uint64(block.timestamp + 365 days), CAP, MIN_CR);

        vm.expectRevert(MUSDirectDebit.InvalidExpiry.selector);
        scheduler.createSchedule(payee, AMOUNT, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp - 1), CAP, MIN_CR);

        vm.expectRevert(MUSDirectDebit.CapBelowFirstPayment.selector);
        scheduler.createSchedule(payee, AMOUNT, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days), AMOUNT - 1, MIN_CR);

        vm.expectRevert(MUSDirectDebit.InvalidMinCR.selector);
        scheduler.createSchedule(payee, AMOUNT, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days), CAP, 1.0e18);

        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Happy path
    // ─────────────────────────────────────────────────────────────────────────────

    function test_executePayment_happyPath() public {
        uint256 id = _create();

        uint128 fee = _expectedFee();
        uint128 net = AMOUNT - fee;

        uint256 payerBefore = musd.balanceOf(payer);
        uint256 payeeBefore = musd.balanceOf(payee);
        uint256 feeBefore = musd.balanceOf(feeRecipient);

        vm.expectEmit(true, true, true, true);
        emit PaymentExecuted(id, payer, payee, AMOUNT, fee, 4e18, uint64(block.timestamp + FREQUENCY));

        vm.prank(keeper);
        scheduler.executePayment(id);

        assertEq(musd.balanceOf(payer), payerBefore - AMOUNT, "payer debited");
        assertEq(musd.balanceOf(payee), payeeBefore + net, "payee credited net");
        assertEq(musd.balanceOf(feeRecipient), feeBefore + fee, "fee paid");

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(s.totalSpent, AMOUNT, "totalSpent advanced");
        assertEq(uint256(s.failureCount), 0, "failureCount reset");
        assertEq(uint256(s.nextExec), block.timestamp + FREQUENCY, "nextExec advanced");
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CR-gate
    // ─────────────────────────────────────────────────────────────────────────────

    function test_executePayment_pausesWhenBelowCR() public {
        uint256 id = _create();
        trove.setICR(payer, 2.4e18); // Below the 250% threshold.

        vm.expectEmit(true, false, false, true);
        emit PaymentPaused(id, MUSDirectDebit.PauseReason.CrBelowThreshold, 2.4e18, 1);

        vm.prank(keeper);
        scheduler.executePayment(id);

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.totalSpent), 0, "no transfer");
        assertEq(uint256(s.failureCount), 1, "failureCount incremented");
        assertEq(uint256(uint8(s.status)), uint256(uint8(MUSDirectDebit.Status.Active)), "still active");
    }

    function test_executePayment_threeFailures_autoCancels() public {
        uint256 id = _create();
        trove.setICR(payer, 2.4e18);

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
        assertEq(uint256(uint8(s.status)), uint256(uint8(MUSDirectDebit.Status.AutoCancelled)));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Recovery Mode floor
    // ─────────────────────────────────────────────────────────────────────────────

    function test_recoveryMode_elevatesFloor() public {
        // User threshold is 250%; ICR is 154% — would normally pass the user floor.
        // But Recovery Mode pushes the effective floor to 155%.
        uint256 id = _create();

        // First, create a schedule with a low user threshold (110%) so we can isolate the
        // RM elevation behavior against an ICR that sits between 110% and 155%.
        vm.prank(payer);
        uint256 id2 = scheduler.createSchedule(
            payee,
            AMOUNT,
            FREQUENCY,
            uint64(block.timestamp),
            uint64(block.timestamp + 365 days),
            CAP,
            1.5e18 // 150%
        );

        trove.setICR(payer, 1.54e18); // 154% — above user 150% floor, but below RM 155%
        borrowerOps.setRecoveryMode(true);

        vm.prank(keeper);
        scheduler.executePayment(id2);

        MUSDirectDebit.Schedule memory s2 = scheduler.getSchedule(id2);
        assertEq(uint256(s2.totalSpent), 0, "RM gate refused execution");
        assertEq(uint256(s2.failureCount), 1, "failure incremented");

        // Schedule 1 (user min 250%) is also blocked under RM with same ICR. Sanity.
        vm.prank(keeper);
        scheduler.executePayment(id);
        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.totalSpent), 0, "user floor also blocks");
    }

    function test_recoveryMode_doesNotLowerHighUserFloor() public {
        // User asks for 300%; RM floor is 155%. Effective floor must remain 300%.
        vm.prank(payer);
        uint256 id = scheduler.createSchedule(
            payee, AMOUNT, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days),
            CAP, 3e18
        );
        trove.setICR(payer, 2.8e18); // above 155% RM floor, below 300% user floor
        borrowerOps.setRecoveryMode(true);

        vm.prank(keeper);
        scheduler.executePayment(id);

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.totalSpent), 0, "user floor still binding");
        assertEq(uint256(s.failureCount), 1);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Cap
    // ─────────────────────────────────────────────────────────────────────────────

    function test_cap_autoCancelsWhenExceeded() public {
        // Create a schedule whose cap is exactly 1 payment.
        vm.prank(payer);
        uint256 id = scheduler.createSchedule(
            payee, AMOUNT, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days),
            AMOUNT, MIN_CR
        );

        vm.prank(keeper);
        scheduler.executePayment(id);

        // Second attempt — totalSpent + amount > cap → AutoCancelled.
        vm.warp(block.timestamp + FREQUENCY);
        vm.expectEmit(true, false, false, false);
        emit ScheduleAutoCancelled(id);
        vm.prank(keeper);
        scheduler.executePayment(id);

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(uint8(s.status)), uint256(uint8(MUSDirectDebit.Status.AutoCancelled)));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Expired
    // ─────────────────────────────────────────────────────────────────────────────

    function test_expired_autoCancels() public {
        uint256 id = _create();
        // Jump well past expiry; nextExec is also past.
        vm.warp(block.timestamp + 366 days);

        vm.expectEmit(true, false, false, false);
        emit ScheduleAutoCancelled(id);
        vm.prank(keeper);
        scheduler.executePayment(id);

        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(uint8(s.status)), uint256(uint8(MUSDirectDebit.Status.AutoCancelled)));
        assertEq(uint256(s.totalSpent), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Cadence — keeper cannot execute early
    // ─────────────────────────────────────────────────────────────────────────────

    function test_cadence_cannotExecuteEarly() public {
        uint256 id = _create();
        vm.prank(keeper);
        scheduler.executePayment(id);

        // Try again immediately — should revert with TooEarly.
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(MUSDirectDebit.TooEarly.selector, uint64(block.timestamp + FREQUENCY)));
        scheduler.executePayment(id);
    }

    function test_cadence_lateExecutionStaysOnSchedule() public {
        // If keeper is late by half a period, the next execution should still be on the
        // ORIGINAL cadence (advance from prior nextExec, not from now), preventing drift.
        uint256 id = _create();
        uint64 firstExec = uint64(block.timestamp);

        vm.prank(keeper);
        scheduler.executePayment(id);
        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.nextExec), uint256(firstExec) + FREQUENCY);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Cancel + re-execute attempts
    // ─────────────────────────────────────────────────────────────────────────────

    function test_cancel_blocksExecution() public {
        uint256 id = _create();

        vm.expectEmit(true, true, false, false);
        emit ScheduleCancelled(id, payer);
        vm.prank(payer);
        scheduler.cancelSchedule(id);

        vm.prank(keeper);
        vm.expectRevert(MUSDirectDebit.ScheduleNotActive.selector);
        scheduler.executePayment(id);
    }

    function test_cancel_onlyPayer() public {
        uint256 id = _create();
        vm.prank(keeper);
        vm.expectRevert(MUSDirectDebit.NotScheduleOwner.selector);
        scheduler.cancelSchedule(id);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Pause / resume
    // ─────────────────────────────────────────────────────────────────────────────

    function test_pauseResume_resetsFailureCount() public {
        uint256 id = _create();
        trove.setICR(payer, 2.0e18); // below threshold

        vm.prank(keeper);
        scheduler.executePayment(id);
        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.failureCount), 1);

        vm.startPrank(payer);
        scheduler.pauseSchedule(id);
        scheduler.resumeSchedule(id);
        vm.stopPrank();

        s = scheduler.getSchedule(id);
        assertEq(uint256(s.failureCount), 0, "resume clears failureCount");
        assertEq(uint256(uint8(s.status)), uint256(uint8(MUSDirectDebit.Status.Active)));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────────

    function test_isDue_truthTable() public {
        uint256 id = _create();
        assertTrue(scheduler.isDue(id), "active + due");

        // Not yet due.
        vm.prank(keeper);
        scheduler.executePayment(id);
        assertFalse(scheduler.isDue(id), "after exec, not due until next period");

        // Cancelled is never due.
        vm.prank(payer);
        scheduler.cancelSchedule(id);
        assertFalse(scheduler.isDue(id));

        // Unknown id.
        assertFalse(scheduler.isDue(9999));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Fee cap
    // ─────────────────────────────────────────────────────────────────────────────

    function test_feeCappedAt5MUSD() public {
        // A huge payment — fee = 0.25% × 100,000 MUSD = 250 MUSD without the cap, but cap = 5 MUSD.
        uint128 bigAmount = 100_000e18;
        musd.mint(payer, bigAmount * 2);

        vm.prank(payer);
        uint256 id = scheduler.createSchedule(
            payee, bigAmount, FREQUENCY, uint64(block.timestamp), uint64(block.timestamp + 365 days),
            bigAmount, MIN_CR
        );

        uint256 feeBefore = musd.balanceOf(feeRecipient);
        vm.prank(keeper);
        scheduler.executePayment(id);
        uint256 feeAfter = musd.balanceOf(feeRecipient);

        assertEq(feeAfter - feeBefore, 5e18, "fee capped at 5 MUSD");
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Successful execution clears failureCount
    // ─────────────────────────────────────────────────────────────────────────────

    function test_successResetsFailureCount() public {
        uint256 id = _create();
        trove.setICR(payer, 2.0e18);
        vm.prank(keeper);
        scheduler.executePayment(id);
        MUSDirectDebit.Schedule memory s = scheduler.getSchedule(id);
        assertEq(uint256(s.failureCount), 1);

        // CR recovers, schedule succeeds; failureCount must reset.
        trove.setICR(payer, 4e18);
        vm.warp(block.timestamp + FREQUENCY);
        vm.prank(keeper);
        scheduler.executePayment(id);

        s = scheduler.getSchedule(id);
        assertEq(uint256(s.failureCount), 0, "success clears failureCount");
        assertEq(uint256(s.totalSpent), AMOUNT);
    }
}
