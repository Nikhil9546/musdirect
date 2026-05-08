import { describe, it, expect, vi } from "vitest";
import {
  BaseError,
  ContractFunctionRevertedError,
  type Address,
  type Hex,
} from "viem";

import { Logger } from "../src/log.js";
import {
  classifyRevert,
  makeInitialState,
  tick,
  type TickDeps,
} from "../src/keeper.js";
import type { ScheduleSnapshot, SchedulerClient } from "../src/scheduler.js";
import { STATUS_ACTIVE } from "../src/abi.js";

const PAYER = "0x000000000000000000000000000000000000A11C" as Address;
const PAYEE = "0x000000000000000000000000000000000000Beef" as Address;
const SCHEDULER = "0x0000000000000000000000000000000000000001" as Address;

function makeRevertError(errorName: string): BaseError {
  // viem's BaseError walk() looks for ContractFunctionRevertedError in the cause chain.
  const reverted = new ContractFunctionRevertedError({
    abi: [{ type: "error", name: errorName, inputs: [] }],
    functionName: "executePayment",
    data: errorName === "TooEarly"
      ? // selector for TooEarly(uint64)
        "0x"
      : "0x",
  });
  // Manually inject the data viem normally parses, since we're constructing by hand.
  (reverted as unknown as { data: { errorName: string } }).data = { errorName };
  return new BaseError("revert", { cause: reverted });
}

describe("classifyRevert", () => {
  it("classifies TooEarly as retryable", () => {
    const r = classifyRevert(makeRevertError("TooEarly"));
    expect(r.outcome).toBe("retryable");
    expect(r.reason).toBe("TooEarly");
  });

  it("classifies ScheduleNotActive as fatal", () => {
    const r = classifyRevert(makeRevertError("ScheduleNotActive"));
    expect(r.outcome).toBe("fatal");
    expect(r.reason).toBe("ScheduleNotActive");
  });

  it("classifies UnknownSchedule as fatal", () => {
    const r = classifyRevert(makeRevertError("UnknownSchedule"));
    expect(r.outcome).toBe("fatal");
  });

  it("classifies unknown reverts as retryable", () => {
    const r = classifyRevert(makeRevertError("MysteryError"));
    expect(r.outcome).toBe("retryable");
    expect(r.reason).toBe("MysteryError");
  });

  it("classifies plain network errors as retryable", () => {
    const r = classifyRevert(new Error("ECONNRESET"));
    expect(r.outcome).toBe("retryable");
    expect(r.reason).toBe("ECONNRESET");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// tick — integration-style with a fake SchedulerClient
// ─────────────────────────────────────────────────────────────────────────────

function makeSnap(id: bigint, overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    scheduleId: id,
    payer: PAYER,
    payee: PAYEE,
    amount: 100n * 10n ** 18n,
    totalSpent: 0n,
    totalSpentCap: 1_200n * 10n ** 18n,
    frequency: 30n * 24n * 60n * 60n,
    nextExec: 1_000_000n,
    expiry: 2_000_000n,
    minSafeCR: 25n * 10n ** 17n,
    status: STATUS_ACTIVE,
    failureCount: 0,
    ...overrides,
  };
}

function makeFakeClient(opts: {
  blockNumber: bigint;
  schedulesByCreationBlock: Record<string, bigint[]>;
  snapshots: Record<string, ScheduleSnapshot>;
  executeImpl?: (id: bigint) => Promise<Hex>;
}): SchedulerClient {
  const execHistory: bigint[] = [];

  const fake = {
    public: {
      getBlockNumber: vi.fn(async () => opts.blockNumber),
    },
    address: SCHEDULER,
    discoverScheduleIds: vi.fn(async (fromBlock: bigint, toBlock: bigint) => {
      const ids: bigint[] = [];
      for (const [block, batch] of Object.entries(opts.schedulesByCreationBlock)) {
        const b = BigInt(block);
        if (b >= fromBlock && (toBlock === undefined || b <= toBlock)) ids.push(...batch);
      }
      return ids;
    }),
    getSchedule: vi.fn(async (id: bigint) => {
      const snap = opts.snapshots[id.toString()];
      if (!snap) throw new Error(`no snapshot for ${id}`);
      return snap;
    }),
    executePayment: vi.fn(async (id: bigint) => {
      execHistory.push(id);
      if (opts.executeImpl) return opts.executeImpl(id);
      return "0xdeadbeef" as Hex;
    }),
  } as unknown as SchedulerClient & { _execHistory: bigint[] };

  (fake as unknown as { _execHistory: bigint[] })._execHistory = execHistory;
  return fake;
}

function makeTickDeps(opts: {
  client: SchedulerClient;
  startBlock?: bigint;
  nowSec?: bigint;
  maxPerTick?: number;
}): TickDeps {
  return {
    client: opts.client,
    log: new Logger("error"),
    state: makeInitialState(opts.startBlock ?? 0n),
    now: () => opts.nowSec ?? 1_000_000n,
    maxPerTick: opts.maxPerTick ?? 50,
  };
}

describe("tick", () => {
  it("discovers new schedules and executes the due ones", async () => {
    const client = makeFakeClient({
      blockNumber: 100n,
      schedulesByCreationBlock: { "10": [1n, 2n], "50": [3n] },
      snapshots: {
        "1": makeSnap(1n, { nextExec: 1_000_000n }),       // due
        "2": makeSnap(2n, { nextExec: 2_000_000n }),       // not yet due
        "3": makeSnap(3n, { status: 2, nextExec: 1_000_000n }), // cancelled
      },
    });

    const deps = makeTickDeps({ client, nowSec: 1_500_000n });
    const result = await tick(deps);

    expect(result.scanned).toBe(3);
    expect(result.attempted).toBe(1);
    expect(result.results[0]?.outcome).toBe("executed");
    expect(result.results[0]?.scheduleId).toBe(1n);
    expect(deps.state.lastScannedBlock).toBe(100n);
  });

  it("respects maxPerTick", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => BigInt(i + 1));
    const snapshots: Record<string, ScheduleSnapshot> = {};
    for (const id of ids) snapshots[id.toString()] = makeSnap(id, { nextExec: 1_000_000n });

    const client = makeFakeClient({
      blockNumber: 50n,
      schedulesByCreationBlock: { "10": ids },
      snapshots,
    });

    const result = await tick(makeTickDeps({ client, nowSec: 1_500_000n, maxPerTick: 3 }));

    expect(result.attempted).toBe(3);
    expect(result.results.every((r) => r.outcome === "executed")).toBe(true);
  });

  it("marks fatally-reverted schedules so they're skipped on subsequent ticks", async () => {
    const client = makeFakeClient({
      blockNumber: 100n,
      schedulesByCreationBlock: { "10": [1n] },
      snapshots: { "1": makeSnap(1n, { nextExec: 1_000_000n }) },
      executeImpl: async () => {
        throw makeRevertError("ScheduleNotActive");
      },
    });

    const deps = makeTickDeps({ client, nowSec: 1_500_000n });
    const r1 = await tick(deps);
    expect(r1.results[0]?.outcome).toBe("fatal");
    expect(deps.state.fatalIds.has(1n)).toBe(true);

    // On the second tick the fatal id should be skipped entirely — no execute call.
    const r2 = await tick(deps);
    expect(r2.attempted).toBe(0);
  });

  it("retries (does not mark fatal) on retryable reverts", async () => {
    const client = makeFakeClient({
      blockNumber: 100n,
      schedulesByCreationBlock: { "10": [1n] },
      snapshots: { "1": makeSnap(1n, { nextExec: 1_000_000n }) },
      executeImpl: async () => {
        throw makeRevertError("TooEarly");
      },
    });

    const deps = makeTickDeps({ client, nowSec: 1_500_000n });
    const r = await tick(deps);
    expect(r.results[0]?.outcome).toBe("retryable");
    expect(deps.state.fatalIds.has(1n)).toBe(false);
  });

  it("only scans new blocks on subsequent ticks", async () => {
    let head = 100n;
    const client = makeFakeClient({
      blockNumber: head,
      schedulesByCreationBlock: { "10": [1n] },
      snapshots: { "1": makeSnap(1n, { nextExec: 9_999_999n }) }, // never due
    });
    // Advance the fake chain between ticks so the keeper has a reason to rescan.
    (client.public.getBlockNumber as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => head
    );

    const deps = makeTickDeps({ client, nowSec: 1_000n });
    await tick(deps);
    head = 200n;
    await tick(deps);

    const calls = (client.discoverScheduleIds as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual([1n, 100n]);
    expect(calls[1]).toEqual([101n, 200n]);
    expect(deps.state.lastScannedBlock).toBe(200n);
  });

  it("skips event scan when no new blocks have been mined", async () => {
    const client = makeFakeClient({
      blockNumber: 100n,
      schedulesByCreationBlock: { "10": [1n] },
      snapshots: { "1": makeSnap(1n, { nextExec: 9_999_999n }) },
    });

    const deps = makeTickDeps({ client, nowSec: 1_000n });
    await tick(deps);
    await tick(deps);

    // Block didn't advance, so the second tick must NOT call discoverScheduleIds again.
    const calls = (client.discoverScheduleIds as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBe(1);
  });
});

function _unused() {
  void Logger;
}
