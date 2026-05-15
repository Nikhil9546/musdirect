// Hooks and helpers for discovering & rendering the connected user's schedules.

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConfig } from "wagmi";
import { type Address, getAbiItem, parseAbiItem } from "viem";
import { getPublicClient } from "wagmi/actions";

import { ENV } from "./env";
import { MUSDIRECT_DEBIT_ABI, SCHEDULE_CREATED_EVENT_ABI } from "./abis";

// `viem` types this neatly when we pull the item from the ABI rather than
// hand-defining the event string.
const SCHEDULE_CREATED_EVENT = SCHEDULE_CREATED_EVENT_ABI;

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

        const logs = await client.getLogs({
          address: scheduler,
          event: getAbiItem({ abi: MUSDIRECT_DEBIT_ABI, name: "ScheduleCreated" }) as
            typeof SCHEDULE_CREATED_EVENT,
          args: { payer: address },
          fromBlock: 13036700n,
          toBlock: "latest",
        });

        const ids = logs
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
