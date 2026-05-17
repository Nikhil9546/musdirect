// Hooks and helpers for discovering & rendering the connected user's schedules.

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConfig } from "wagmi";
import { type Address, getAbiItem, parseAbiItem } from "viem";
import { getPublicClient } from "wagmi/actions";

import { ENV } from "./env";
import { MUSDIRECT_DEBIT_ABI } from "./abis";

// `viem` types this neatly when we pull the item from the ABI rather than
// hand-defining the event string.

export interface Schedule {
  id: bigint;
  payer: Address;
  payee: Address;
  amount: bigint;
  totalSpent: bigint;
  totalSpentCap: bigint;
  frequency: bigint;
  nextExec: bigint;
  expiry: bigint;
  minSafeCR: bigint;
  status: number;
  failureCount: number;
}

interface State {
  loading: boolean;
  error: string | null;
  schedules: Schedule[];
  refetch: () => void;
}

/// Fetches all schedule IDs created by the connected user via `ScheduleCreated`
/// event filter (cheap on chains with reasonable log support), then reads each
/// schedule's current state. Polls on demand via `refetch()`.
export function useUserSchedules(): State {
  const { address } = useAccount();
  const config = useConfig();
  const chainId = useChainId();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const scheduler = ENV.scheduler;
    if (!address || !scheduler) {
      setSchedules([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const client = getPublicClient(config, { chainId });
        if (!client) throw new Error("no public client");

        const currentBlock = await client.getBlockNumber();
        const startBlock = 13058000n; // Use the pulled start block
        const CHUNK_SIZE = 9999n;

        const event = getAbiItem({ abi: MUSDIRECT_DEBIT_ABI, name: "ScheduleCreated" });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allLogs: any[] = [];
        if (currentBlock >= startBlock) {
          for (let from = startBlock; from <= currentBlock; from += CHUNK_SIZE + 1n) {
            const to = from + CHUNK_SIZE > currentBlock ? currentBlock : from + CHUNK_SIZE;
            const logs = await client.getLogs({
              address: scheduler,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              event: event as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              args: { payer: address } as any,
              fromBlock: from,
              toBlock: to,
            });
            allLogs = [...allLogs, ...logs];
          }
        }

        const ids = allLogs
          .map((l) => (l.args as { scheduleId?: bigint }).scheduleId)
          .filter((v): v is bigint => v !== undefined);

        const fresh: Schedule[] = await Promise.all(
          ids.map(async (id) => {
            const result = (await client.readContract({
              address: scheduler,
              abi: MUSDIRECT_DEBIT_ABI,
              functionName: "getSchedule",
              args: [id],
            })) as Omit<Schedule, "id">;
            return { id, ...result };
          })
        );

        // Sort newest-first.
        fresh.sort((a, b) => (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));
        if (!cancelled) setSchedules(fresh);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [address, chainId, config, tick]);

  return { loading, error, schedules, refetch: () => setTick((t) => t + 1) };
}

// Touched here so the import is preserved when this file is processed by SWC,
// even though we use `getAbiItem` rather than `parseAbiItem` at runtime.
void parseAbiItem;
