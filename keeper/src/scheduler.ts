import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { MUSDIRECT_DEBIT_ABI, STATUS_ACTIVE } from "./abi.js";

export interface ScheduleSnapshot {
  scheduleId: bigint;
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

export interface ExecuteResult {
  scheduleId: bigint;
  txHash?: Hex;
  /** "executed" — tx landed (whether the contract paid or paused internally is in the receipt). */
  /** "skipped" — keeper short-circuited before submitting (e.g. not due, not active). */
  /** "retryable" — transient failure (RPC timeout, nonce collision, etc.). */
  /** "fatal" — schedule is permanently un-executable (cancelled, unknown). */
  outcome: "executed" | "skipped" | "retryable" | "fatal";
  reason?: string;
}

export class SchedulerClient {
  readonly public: PublicClient;
  readonly wallet: WalletClient;
  readonly account: ReturnType<typeof privateKeyToAccount>;
  readonly address: Address;

  constructor(opts: {
    rpcUrl: string;
    chainId: number;
    schedulerAddress: Address;
    keeperPrivateKey: Hex;
  }) {
    const transport = http(opts.rpcUrl);
    const chain = {
      id: opts.chainId,
      name: `chain-${opts.chainId}`,
      nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
      rpcUrls: { default: { http: [opts.rpcUrl] } },
    };

    this.public = createPublicClient({ chain, transport });
    this.account = privateKeyToAccount(opts.keeperPrivateKey);
    this.wallet = createWalletClient({ account: this.account, chain, transport });
    this.address = opts.schedulerAddress;
  }

  /// Discovers all schedules ever created by scanning ScheduleCreated events.
  /// Returns the deduplicated set of scheduleIds. Cancellations and auto-cancellations
  /// are not filtered here — caller must check status before executing.
  async discoverScheduleIds(fromBlock: bigint, toBlock: bigint | "latest" = "latest"): Promise<bigint[]> {
    const event = parseAbiItem(
      "event ScheduleCreated(uint256 indexed scheduleId, address indexed payer, address indexed payee, uint128 amount, uint64 frequency, uint64 nextExec, uint64 expiry, uint128 totalSpentCap, uint128 minSafeCR)"
    );
    const logs = await this.public.getLogs({
      address: this.address,
      event,
      fromBlock,
      toBlock,
    });
    const ids = new Set<bigint>();
    for (const log of logs) {
      const id = log.args.scheduleId;
      if (id !== undefined) ids.add(id);
    }
    return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  async getSchedule(scheduleId: bigint): Promise<ScheduleSnapshot> {
    const result = (await this.public.readContract({
      address: this.address,
      abi: MUSDIRECT_DEBIT_ABI,
      functionName: "getSchedule",
      args: [scheduleId],
    })) as Omit<ScheduleSnapshot, "scheduleId">;

    return { scheduleId, ...result };
  }

  async isDue(scheduleId: bigint): Promise<boolean> {
    return (await this.public.readContract({
      address: this.address,
      abi: MUSDIRECT_DEBIT_ABI,
      functionName: "isDue",
      args: [scheduleId],
    })) as boolean;
  }

  /// Submits executePayment(scheduleId). Caller is responsible for retry policy.
  async executePayment(scheduleId: bigint): Promise<Hex> {
    const { request } = await this.public.simulateContract({
      address: this.address,
      abi: MUSDIRECT_DEBIT_ABI,
      functionName: "executePayment",
      args: [scheduleId],
      account: this.account,
    });
    return this.wallet.writeContract(request);
  }
}

/// Pure decision function — given the current snapshot of a schedule and the current
/// block timestamp, decide whether the keeper should attempt to execute it now.
/// Tested independently of viem in keeper.test.ts.
export function shouldAttempt(s: ScheduleSnapshot, nowSec: bigint): boolean {
  if (s.status !== STATUS_ACTIVE) return false;
  if (nowSec < s.nextExec) return false;
  if (s.totalSpent + s.amount > s.totalSpentCap) return false;
  return true;
}
