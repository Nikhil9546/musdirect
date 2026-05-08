import cron from "node-cron";

import { loadConfig } from "./config.js";
import { Logger } from "./log.js";
import { makeInitialState, tick } from "./keeper.js";
import { SchedulerClient } from "./scheduler.js";

async function main() {
  const cfg = loadConfig();
  const log = new Logger(cfg.logLevel);

  const client = new SchedulerClient({
    rpcUrl: cfg.rpcUrl,
    chainId: cfg.chainId,
    schedulerAddress: cfg.schedulerAddress,
    keeperPrivateKey: cfg.keeperPrivateKey,
  });

  log.info("keeper starting", {
    rpc: cfg.rpcUrl,
    chainId: cfg.chainId,
    scheduler: cfg.schedulerAddress,
    cron: cfg.cronSchedule,
    keeper: client.account.address,
  });

  const state = makeInitialState(cfg.startBlock);
  let inFlight = false;

  const runTick = async () => {
    if (inFlight) {
      log.warn("tick skipped — previous tick still running");
      return;
    }
    inFlight = true;
    try {
      const result = await tick({
        client,
        log,
        state,
        now: () => BigInt(Math.floor(Date.now() / 1000)),
        maxPerTick: cfg.maxPerTick,
      });
      log.info("tick done", {
        scanned: result.scanned,
        attempted: result.attempted,
        executed: result.results.filter((r) => r.outcome === "executed").length,
        retryable: result.results.filter((r) => r.outcome === "retryable").length,
        fatal: result.results.filter((r) => r.outcome === "fatal").length,
      });
    } catch (err) {
      log.error("tick failed", { err: err instanceof Error ? err.message : String(err) });
    } finally {
      inFlight = false;
    }
  };

  // Run once at startup so the keeper isn't asleep until the first cron tick.
  await runTick();

  cron.schedule(cfg.cronSchedule, runTick);
  log.info("keeper running");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
