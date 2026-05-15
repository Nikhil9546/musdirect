import {
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";

import { ERC20_APPROVE_ABI, MUSDIRECT_ONESHOT_ABI } from "./abi";
import { PAYMENT_RECEIPT_HEADER, type PaymentRequired } from "./types";

export interface PayOptions {
  walletClient: WalletClient;
  publicClient: PublicClient;
  paymentRequired: PaymentRequired;
  /// Override `troveOwner` from the challenge (e.g. agent's human owner).
  troveOwner?: Address;
  /// Approve at least this much MUSD if the current allowance is insufficient.
  /// Defaults to a generous 100x the requested amount so the agent doesn't
  /// need to approve again on the next call.
  approvalMultiplier?: bigint;
}

export interface PayResult {
  txHash: Hex;
  requestId: Hex;
  /// Receipt string ready to drop into the `X-Musdirect-Payment` header on
  /// the retry request: `<txHash>.<requestId>`.
  receiptHeader: string;
}

/// Settle an x402 challenge end-to-end:
///   1. Read current MUSD allowance for the scheduler; if insufficient, approve.
///   2. Send `executeOneShot(...)` with the requestId from the challenge.
///   3. Return tx hash + the receipt header string.
///
/// The caller is responsible for retrying the original HTTP request with the
/// returned `receiptHeader`.
export async function x402Pay(opts: PayOptions): Promise<PayResult> {
  const { walletClient, publicClient, paymentRequired: pr } = opts;
  const account = walletClient.account;
  if (!account) throw new Error("walletClient has no account");

  const amount = BigInt(pr.amount);
  const minSafeCR = BigInt(pr.minSafeCR);
  const troveOwner = opts.troveOwner ?? pr.troveOwner;

  // ── Step 1: allowance ──────────────────────────────────────────────────
  const allowance = (await publicClient.readContract({
    address: pr.musd,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: [account.address, pr.scheduler],
  })) as bigint;

  if (allowance < amount) {
    const wanted = amount * (opts.approvalMultiplier ?? 100n);
    const approveData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [pr.scheduler, wanted],
    });
    const approveHash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain ?? null,
      to: pr.musd,
      data: approveData,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  // ── Step 2: executeOneShot ─────────────────────────────────────────────
  const data = encodeFunctionData({
    abi: MUSDIRECT_ONESHOT_ABI,
    functionName: "executeOneShot",
    args: [troveOwner, pr.recipient, amount, minSafeCR, pr.requestId],
  });
  const txHash = await walletClient.sendTransaction({
    account,
    chain: walletClient.chain ?? null,
    to: pr.scheduler,
    data,
    gas: 300_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    requestId: pr.requestId,
    receiptHeader: `${txHash}.${pr.requestId}`,
  };
}

/// Higher-level: do an end-to-end x402 GET. Handles the 402 → pay → retry
/// loop in one call. Returns the final Response (or the 402 if the gate
/// refused execution).
export async function fetchWith402(
  url: string,
  init: (RequestInit & { walletClient: WalletClient; publicClient: PublicClient; troveOwner?: Address }) = {} as never
): Promise<Response> {
  const { walletClient, publicClient, troveOwner, ...rest } = init;
  const initial = await fetch(url, rest);
  if (initial.status !== 402) return initial;

  const pr = (await initial.json()) as PaymentRequired;
  const { receiptHeader } = await x402Pay({
    walletClient,
    publicClient,
    paymentRequired: pr,
    troveOwner,
  });

  const retryHeaders = new Headers(rest.headers ?? {});
  retryHeaders.set(PAYMENT_RECEIPT_HEADER, receiptHeader);
  return fetch(url, { ...rest, headers: retryHeaders });
}
