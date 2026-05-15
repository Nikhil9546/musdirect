import {
  createPublicClient,
  decodeEventLog,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { MUSDIRECT_ONESHOT_ABI } from "./abi.js";

export interface DecodedOneShot {
  requestId: Hex;
  payer: Address;
  payee: Address;
  troveOwner: Address;
  amount: bigint;
  fee: bigint;
  currentICR: bigint;
}

export interface VerifyExpectation {
  requestId: Hex;
  schedulerAddress: Address;
  /// Required recipient — `payee` in the event.
  recipient: Address;
  /// Minimum acceptable amount.
  minAmount: bigint;
  /// Optional — when set, also require the troveOwner field to match.
  expectedTroveOwner?: Address;
}

export type VerifyResult =
  | { ok: true; decoded: DecodedOneShot; txHash: Hex }
  | { ok: false; reason: string };

/// Verifies an x402 payment receipt by:
///   1. Pulling the tx receipt from the RPC.
///   2. Confirming the tx succeeded and was sent to the scheduler.
///   3. Decoding the OneShotPaid event and matching it against expectations.
///
/// Idempotent and stateless — caller is responsible for tracking which
/// requestIds have already been accepted (server middleware does this).
export async function verifyOneShotReceipt(
  client: PublicClient,
  txHash: Hex,
  expected: VerifyExpectation
): Promise<VerifyResult> {
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return { ok: false, reason: "tx not yet mined" };
  }
  if (receipt.status !== "success") {
    return { ok: false, reason: "tx reverted" };
  }
  if (receipt.to?.toLowerCase() !== expected.schedulerAddress.toLowerCase()) {
    return { ok: false, reason: "tx not sent to scheduler" };
  }

  // Find the OneShotPaid log emitted from the scheduler. The event has the
  // requestId, payer, and payee as indexed topics; topic[0] is the signature.
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== expected.schedulerAddress.toLowerCase()) {
      continue;
    }
    try {
      const decoded = decodeEventLog({
        abi: MUSDIRECT_ONESHOT_ABI,
        topics: log.topics,
        data: log.data,
      });
      if (decoded.eventName !== "OneShotPaid") continue;
      const args = decoded.args as unknown as DecodedOneShot;

      if (args.requestId.toLowerCase() !== expected.requestId.toLowerCase()) {
        continue; // not the receipt we want
      }
      if (args.payee.toLowerCase() !== expected.recipient.toLowerCase()) {
        return { ok: false, reason: "payee != expected recipient" };
      }
      if (args.amount < expected.minAmount) {
        return {
          ok: false,
          reason: `amount ${args.amount} < required ${expected.minAmount}`,
        };
      }
      if (
        expected.expectedTroveOwner &&
        args.troveOwner.toLowerCase() !== expected.expectedTroveOwner.toLowerCase()
      ) {
        return { ok: false, reason: "troveOwner mismatch" };
      }
      return { ok: true, decoded: args, txHash };
    } catch {
      // not our event — keep scanning
    }
  }
  return { ok: false, reason: "no matching OneShotPaid log" };
}

/// Convenience — build a public client suitable for verifying receipts. The
/// caller can also bring their own (e.g. wagmi's getPublicClient).
export function createVerifyClient(opts: { rpcUrl: string; chainId: number }): PublicClient {
  return createPublicClient({
    chain: {
      id: opts.chainId,
      name: `chain-${opts.chainId}`,
      nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
      rpcUrls: { default: { http: [opts.rpcUrl] } },
    },
    transport: http(opts.rpcUrl),
  });
}
