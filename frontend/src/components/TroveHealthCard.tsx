"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";

import { ENV } from "@/lib/env";
import { ERC20_ABI, PRICE_FEED_READ_ABI, STATUS_ACTIVE, TROVE_MANAGER_ABI } from "@/lib/abis";
import { fmtCR, fmtToken, fmtUsdPrice, safeHeadroomPct } from "@/lib/format";
import { useUserSchedules } from "@/lib/schedules";

interface Props {
  account: Address;
}

export function TroveHealthCard({ account }: Props) {
  // Live BTC price (used to ask for ICR).
  const priceQuery = useReadContract({
    address: ENV.priceFeed,
    abi: PRICE_FEED_READ_ABI,
    functionName: "fetchPrice",
  });

  // ICR + Recovery Mode + MUSD balance — single multicall.
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

  // Pull the user's schedules so we can compute "safe headroom" against the
  // most aggressive threshold they've configured (i.e. the highest minSafeCR
  // among their active schedules — that's the first one that would pause as
  // BTC falls).
  const { schedules } = useUserSchedules();

  const price = priceQuery.data;
  const icr = batched.data?.[0]?.result as bigint | undefined;
  const recoveryMode = batched.data?.[1]?.result as boolean | undefined;
  const musdBalance = batched.data?.[2]?.result as bigint | undefined;

  const noTrove = icr === BigInt(2) ** BigInt(256) - BigInt(1);

  // Highest minSafeCR across active schedules → tightest gate → drives headroom.
  const tightestCR = useMemo(() => {
    let max: bigint | undefined;
    for (const s of schedules) {
      if (s.status !== STATUS_ACTIVE) continue;
      if (max === undefined || s.minSafeCR > max) max = s.minSafeCR;
    }
    return max;
  }, [schedules]);

  const headroom = safeHeadroomPct(icr, tightestCR);

  return (
    <div className="card">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold text-mezo-ink">Trove health</h2>
        <span className="text-xs font-semibold text-mezo-mute">BTC {fmtUsdPrice(price)}</span>
      </div>

      <dl className="grid grid-cols-2 gap-y-3 text-sm">
        <dt className="font-semibold text-mezo-mute">Your CR</dt>
        <dd className="text-right font-mono font-bold">{fmtCR(icr)}</dd>

        <dt className="font-semibold text-mezo-mute">MUSD balance</dt>
        <dd className="text-right font-mono font-bold">{fmtToken(musdBalance)}</dd>

        <dt className="font-semibold text-mezo-mute">System status</dt>
        <dd className="text-right font-mono font-bold">
          {recoveryMode === undefined
            ? "—"
            : recoveryMode
              ? <span className="text-red-600">Recovery Mode</span>
              : <span className="text-emerald-600">Normal</span>}
        </dd>

        {tightestCR !== undefined && (
          <>
            <dt className="font-semibold text-mezo-mute">Tightest threshold</dt>
            <dd className="text-right font-mono font-bold">{fmtCR(tightestCR)}</dd>
          </>
        )}
      </dl>

      {/* Safe-headroom section — the load-bearing visual per PRD §6 P0-6. */}
      {headroom !== null && tightestCR !== undefined && (
        <div
          className={`mt-4 rounded-xl border-2 p-4 ${
            headroom > 0.3
              ? "border-emerald-300 bg-emerald-50"
              : headroom > 0.1
                ? "border-amber-300 bg-amber-50"
                : "border-red-300 bg-red-50"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-mezo-mute">
            Safe headroom
          </p>
          <p className="mt-1 font-mono text-2xl font-extrabold text-mezo-ink">
            {(headroom * 100).toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-mezo-mute">
            BTC can drop by this much before your next scheduled payment pauses.
            Current BTC&nbsp;×&nbsp;(1&nbsp;−&nbsp;{(headroom * 100).toFixed(1)}%)&nbsp;=&nbsp;{fmtUsdPrice(
              price === undefined
                ? undefined
                : (price * BigInt(Math.floor((1 - headroom) * 10_000))) / 10_000n
            )}
          </p>
        </div>
      )}

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
