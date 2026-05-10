"use client";

import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";

import { ENV } from "@/lib/env";
import { ERC20_ABI, PRICE_FEED_READ_ABI, TROVE_MANAGER_ABI } from "@/lib/abis";
import { fmtCR, fmtToken, fmtUsdPrice } from "@/lib/format";

interface Props {
  account: Address;
}

/// Reads BTC price + the connected user's ICR + their MUSD balance from the
/// real Mezo testnet contracts. Static-only — doesn't write anything yet.
/// Will become the "safe headroom" widget per PRD §6 P0-6.
export function TroveHealthCard({ account }: Props) {
  // Step 1: get the live BTC price (used to ask for ICR).
  const priceQuery = useReadContract({
    address: ENV.priceFeed,
    abi: PRICE_FEED_READ_ABI,
    functionName: "fetchPrice",
  });

  // Step 2: ICR + Recovery Mode + MUSD balance, batched in a single multicall.
  const batched = useReadContracts({
    contracts: [
      {
        address: ENV.troveManager,
        abi: TROVE_MANAGER_ABI,
        functionName: "getCurrentICR",
        args: [account, priceQuery.data ?? BigInt(0)],
      },
      {
        address: ENV.troveManager,
        abi: TROVE_MANAGER_ABI,
        functionName: "checkRecoveryMode",
        args: [priceQuery.data ?? BigInt(0)],
      },
      {
        address: ENV.musd,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account],
      },
    ],
    query: { enabled: priceQuery.isSuccess },
  });

  const price = priceQuery.data;
  const icr = batched.data?.[0]?.result as bigint | undefined;
  const recoveryMode = batched.data?.[1]?.result as boolean | undefined;
  const musdBalance = batched.data?.[2]?.result as bigint | undefined;

  const noTrove = icr === BigInt(2) ** BigInt(256) - BigInt(1);

  return (
    <div className="rounded-lg border border-mezo-edge bg-mezo-surface p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Trove health</h2>
        <span className="text-xs text-mezo-mute">
          BTC {fmtUsdPrice(price)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-y-3 text-sm">
        <dt className="text-mezo-mute">Your CR</dt>
        <dd className="text-right font-mono">{fmtCR(icr)}</dd>

        <dt className="text-mezo-mute">MUSD balance</dt>
        <dd className="text-right font-mono">{fmtToken(musdBalance)}</dd>

        <dt className="text-mezo-mute">System status</dt>
        <dd className="text-right font-mono">
          {recoveryMode === undefined
            ? "—"
            : recoveryMode
              ? <span className="text-red-400">Recovery Mode</span>
              : <span className="text-emerald-400">Normal</span>}
        </dd>
      </dl>

      {noTrove && (
        <p className="mt-4 rounded bg-mezo-edge/40 p-3 text-xs text-mezo-mute">
          You don&apos;t have a Trove on this network. Open one in Mezo Borrow to
          back MUSD payments with Bitcoin collateral. Without a Trove, the CR
          gate is non-binding (ICR = ∞) and any schedule will execute as long as
          you have an MUSD balance and approval.
        </p>
      )}

      {batched.isError && (
        <p className="mt-4 text-xs text-red-400">
          Read failed: {batched.error?.message ?? "unknown"}
        </p>
      )}
    </div>
  );
}
