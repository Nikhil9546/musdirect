"use client";

import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";

import { ENV } from "@/lib/env";
import { ERC20_ABI, PRICE_FEED_READ_ABI, TROVE_MANAGER_ABI } from "@/lib/abis";
import { fmtCR, fmtToken, fmtUsdPrice } from "@/lib/format";

interface Props {
  account: Address;
}

export function TroveHealthCard({ account }: Props) {
  const priceQuery = useReadContract({
    address: ENV.priceFeed,
    abi: PRICE_FEED_READ_ABI,
    functionName: "fetchPrice",
  });

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
    <div className="card">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold text-mezo-ink">Trove health</h2>
        <span className="text-xs font-semibold text-mezo-mute">
          BTC {fmtUsdPrice(price)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-y-3 text-sm">
        <dt className="font-semibold text-mezo-mute">Your CR</dt>
        <dd className="text-right font-mono font-bold">{fmtCR(icr)}</dd>

        <dt className="font-semibold text-mezo-mute">MUSD balance</dt>
        <dd className="text-right font-mono font-bold">{fmtToken(musdBalance)}</dd>

        <dt className="font-semibold text-mezo-mute">System status</dt>
        <dd className="text-right font-mono font-bold">
          {recoveryMode === undefined
            ? "\u2014"
            : recoveryMode
              ? <span className="text-red-600">Recovery Mode</span>
              : <span className="text-emerald-600">Normal</span>}
        </dd>
      </dl>

      {noTrove && (
        <p className="mt-4 rounded-xl border-2 border-mezo-orange/30 bg-orange-50 p-3 text-xs text-mezo-mute">
          You don&apos;t have a Trove on this network. Open one in Mezo Borrow to
          back MUSD payments with Bitcoin collateral. Without a Trove, the CR
          gate is non-binding (ICR = &infin;) and any schedule will execute as long as
          you have an MUSD balance and approval.
        </p>
      )}

      {batched.isError && (
        <p className="mt-4 text-xs font-semibold text-red-600">
          Read failed: {batched.error?.message ?? "unknown"}
        </p>
      )}
    </div>
  );
}
