import { describe, it, expect } from "vitest";
import { type Address } from "viem";

import { shouldAttempt, type ScheduleSnapshot } from "../src/scheduler.js";
import { STATUS_ACTIVE } from "../src/abi.js";

const PAYER = "0x000000000000000000000000000000000000A11C" as Address;
const PAYEE = "0x000000000000000000000000000000000000Beef" as Address;

function makeSnap(overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    scheduleId: 1n,
    payer: PAYER,
    payee: PAYEE,
    amount: 100n * 10n ** 18n,
    totalSpent: 0n,
    totalSpentCap: 1_200n * 10n ** 18n,
    frequency: 30n * 24n * 60n * 60n,
    nextExec: 1_000_000n,
    expiry: 2_000_000n,
    minSafeCR: 25n * 10n ** 17n, // 250%
    status: STATUS_ACTIVE,
    failureCount: 0,
    ...overrides,
  };
}

describe("shouldAttempt", () => {
  it("returns true when active, due, and within cap", () => {
    expect(shouldAttempt(makeSnap(), 1_000_000n)).toBe(true);
    expect(shouldAttempt(makeSnap(), 1_000_001n)).toBe(true);
  });

  it("returns false when not yet due", () => {
    expect(shouldAttempt(makeSnap({ nextExec: 1_000_000n }), 999_999n)).toBe(false);
  });

  it("returns false for non-active statuses", () => {
    for (const status of [1, 2, 3]) {
      expect(shouldAttempt(makeSnap({ status }), 1_000_000n)).toBe(false);
    }
  });

  it("returns false when next payment would breach the cap", () => {
    const snap = makeSnap({
      amount: 100n * 10n ** 18n,
      totalSpent: 1_150n * 10n ** 18n,
      totalSpentCap: 1_200n * 10n ** 18n,
    });
    expect(shouldAttempt(snap, 1_000_000n)).toBe(false);
  });
});
