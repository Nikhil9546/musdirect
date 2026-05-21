import { BaseError, ContractFunctionRevertedError } from "viem";

import type { Logger } from "./log.js";
import {
  type ExecuteResult,
  type ScheduleSnapshot,
  SchedulerClient,
  shouldAttempt,
} from "./scheduler.js";

export interface KeeperState {
  /// Highest block number whose ScheduleCreated events have been incorporated.
  /// Persisted across ticks so we don't rescan history every minute.
  lastScannedBlock: bigint;
  /// All known schedule IDs the keeper has discovered (active or otherwise).
  knownIds: Set<bigint>;
  /// Schedules we've decided are permanently un-executable; never tried again.
  fatalIds: Set<bigint>;
}

export function makeInitialState(startBlock: bigint): KeeperState {
  return {
    lastScannedBlock: startBlock > 0n ? startBlock - 1n : 0n,
    knownIds: new Set(),
    fatalIds: new Set(),
  };
}

export interface TickDeps {
  client: SchedulerClient;
  log: Logger;
  state: KeeperState;
  now: () => bigint;
  maxPerTick: number;
}

export interface TickResult {
  scanned: number;
  attempted: number;
  results: ExecuteResult[];
}

/// One iteration of the keeper loop.
///
/// 1. Pull new ScheduleCreated events since lastScannedBlock.
/// 2. For each known (and not fatal) schedule, fetch the snapshot.
/// 3. Locally decide if it's due (avoids paying gas on hopeless calls).
/// 4. Submit executePayment for the candidates, classifying outcomes.
export async function tick(deps: TickDeps): Promise<TickResult> {
  const { client, log, state, now, maxPerTick } = deps;
  const head = await client.public.getBlockNumber();
  const fromBlock = state.lastScannedBlock + 1n;

  if (head >= fromBlock) {
    const CHUNK_SIZE = 10000n;
    let currentFrom = fromBlock;
    let totalDiscovered = 0;

    while (currentFrom <= head) {
      const currentTo = currentFrom + CHUNK_SIZE - 1n > head ? head : currentFrom + CHUNK_SIZE - 1n;
      const newIds = await client.discoverScheduleIds(currentFrom, currentTo);
      for (const id of newIds) state.knownIds.add(id);
      totalDiscovered += newIds.length;
      currentFrom = currentTo + 1n;
    }

    state.lastScannedBlock = head;
    if (totalDiscovered > 0) log.info("discovered schedules", { count: totalDiscovered, head });
  }

  const candidates: ScheduleSnapshot[] = [];
  const nowSec = now();
  for (const id of state.knownIds) {
    if (state.fatalIds.has(id)) continue;
    let snap: ScheduleSnapshot;
    try {
      snap = await client.getSchedule(id);
    } catch (err) {
      log.warn("getSchedule failed", { id, err: errMessage(err) });
      continue;
    }
    if (!shouldAttempt(snap, nowSec)) continue;
    candidates.push(snap);
    if (candidates.length >= maxPerTick) break;
  }

  log.debug("tick candidates", { scanned: state.knownIds.size, attempting: candidates.length });

  const results: ExecuteResult[] = [];
  for (const c of candidates) {
    const r = await executeWithClassification(client, c.scheduleId, log);
    results.push(r);
    if (r.outcome === "fatal") state.fatalIds.add(c.scheduleId);
  }

  return { scanned: state.knownIds.size, attempted: candidates.length, results };
}

/// Wraps executePayment, mapping common revert classes to retry semantics.
export async function executeWithClassification(
  client: SchedulerClient,
  scheduleId: bigint,
  log: Logger
): Promise<ExecuteResult> {
  try {
    const txHash = await client.executePayment(scheduleId);
    log.info("executed", { id: scheduleId, txHash });
    return { scheduleId, txHash, outcome: "executed" };
  } catch (err) {
    const classified = classifyRevert(err);
    log[classified.outcome === "fatal" ? "warn" : "debug"]("execute failed", {
      id: scheduleId,
      ...classified,
    });
    return { scheduleId, ...classified };
  }
}

export function classifyRevert(err: unknown): Pick<ExecuteResult, "outcome" | "reason"> {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const errorName = reverted.data?.errorName;
      switch (errorName) {
        case "TooEarly":
          // Race condition: snapshot said due, contract disagrees. Retry next tick.
          return { outcome: "retryable", reason: errorName };
        case "ScheduleNotActive":
          // User cancelled / paused / auto-cancelled between our read and our write.
          return { outcome: "fatal", reason: errorName };
        case "UnknownSchedule":
          return { outcome: "fatal", reason: errorName };
        default:
          // Something else; treat as retryable until we know better.
          return { outcome: "retryable", reason: errorName ?? "unknown_revert" };
      }
    }
  }
  // Network / nonce / RPC issues — retry next tick.
  return { outcome: "retryable", reason: errMessage(err) };
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message.split("\n")[0] ?? "error";
  return String(err);
}
