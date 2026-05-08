/// One-shot tick — reads .env, runs a single keeper tick, prints the result, exits.
/// Useful for the e2e harness and for ad-hoc debugging without keeping a process up.

import { loadConfig } from "../config.js";
import { Logger } from "../log.js";
import { makeInitialState, tick } from "../keeper.js";
import { SchedulerClient } from "../scheduler.js";

async function main() {
  const cfg = loadConfig();
  const log = new Logger(cfg.logLevel);

  const client = new SchedulerClient({
    rpcUrl: cfg.rpcUrl,
    chainId: cfg.chainId,
    schedulerAddress: cfg.schedulerAddress,
    keeperPrivateKey: cfg.keeperPrivateKey,
  });

  const state = makeInitialState(cfg.startBlock);
  const result = await tick({
    client,
    log,
    state,
    now: () => BigInt(Math.floor(Date.now() / 1000)),
    maxPerTick: cfg.maxPerTick,
  });

  console.log(JSON.stringify({
    scanned: result.scanned,
    attempted: result.attempted,
    results: result.results.map((r) => ({
      scheduleId: r.scheduleId.toString(),
      outcome: r.outcome,
      reason: r.reason,
      txHash: r.txHash,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error("tick error:", err);
  process.exit(1);
});
