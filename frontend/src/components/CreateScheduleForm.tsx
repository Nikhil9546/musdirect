"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Address } from "viem";

import { ENV } from "@/lib/env";
import { ERC20_ABI, MUSDIRECT_DEBIT_ABI } from "@/lib/abis";
import { parseTokenAmount } from "@/lib/format";

const FREQUENCY_OPTIONS = [
  { label: "Daily", seconds: 86_400 },
  { label: "Weekly", seconds: 7 * 86_400 },
  { label: "Monthly (30d)", seconds: 30 * 86_400 },
  { label: "Quarterly (90d)", seconds: 90 * 86_400 },
] as const;

const EXPIRY_OPTIONS = [
  { label: "1 month", seconds: 30 * 86_400 },
  { label: "3 months", seconds: 90 * 86_400 },
  { label: "1 year", seconds: 365 * 86_400 },
  { label: "2 years", seconds: 2 * 365 * 86_400 },
] as const;

/// Pct → 1e18-scaled CR. 150 → 1.5e18.
function pctToCR(pct: number): bigint {
  return (BigInt(Math.floor(pct)) * 10n ** 16n);
}

interface Props {
  onCreated?: () => void;
}

export function CreateScheduleForm({ onCreated }: Props) {
  const { address } = useAccount();
  const scheduler = ENV.scheduler;

  // ── Form state ──────────────────────────────────────────────────────────
  const [payee, setPayee] = useState("");
  const [amountStr, setAmountStr] = useState("100");
  const [frequency, setFrequency] = useState<number>(FREQUENCY_OPTIONS[2].seconds); // monthly
  const [expirySec, setExpirySec] = useState<number>(EXPIRY_OPTIONS[2].seconds); // 1 year
  // Default sits at the live testnet population's median CR (152% as of
  // 2026-05-10 — see keeper/scripts/trove-distribution output). The slider
  // floor is 120% (just above absolute liquidation); ceiling 400% for the
  // most conservative users.
  const [minCRPct, setMinCRPct] = useState<number>(150);
  const [status, setStatus] = useState<string | null>(null);

  // ── Derived: amount as bigint and total cap (amount × #periods) ─────────
  const amount = useMemo(() => {
    try {
      return parseTokenAmount(amountStr || "0");
    } catch {
      return 0n;
    }
  }, [amountStr]);

  const periods = Math.max(1, Math.floor(expirySec / frequency));
  const totalSpentCap = amount * BigInt(periods);

  // ── Allowance check ─────────────────────────────────────────────────────
  const { data: currentAllowance } = useReadContract({
    address: ENV.musd,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && scheduler ? [address, scheduler] : undefined,
    query: { enabled: Boolean(address && scheduler) },
  });

  const needsApproval =
    totalSpentCap > 0n &&
    (currentAllowance === undefined || (currentAllowance as bigint) < totalSpentCap);

  // ── Approve write ───────────────────────────────────────────────────────
  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });

  // ── Create-schedule write ───────────────────────────────────────────────
  const create = useWriteContract();
  const createReceipt = useWaitForTransactionReceipt({ hash: create.data });

  // ── Effect: once approval lands, automatically fire createSchedule ──────
  useEffect(() => {
    if (approveReceipt.isSuccess && !create.data && !create.isPending && scheduler) {
      submitCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess]);

  // ── Effect: notify parent on success ────────────────────────────────────
  useEffect(() => {
    if (createReceipt.isSuccess) {
      setStatus("Schedule created");
      onCreated?.();
    }
  }, [createReceipt.isSuccess, onCreated]);

  // ── Validation ──────────────────────────────────────────────────────────
  const payeeValid = /^0x[0-9a-fA-F]{40}$/.test(payee) && payee.toLowerCase() !== address?.toLowerCase();
  const amountValid = amount > 0n;
  const crValid = minCRPct >= 110;
  const ready = Boolean(scheduler) && payeeValid && amountValid && crValid;

  // ── Submitters ──────────────────────────────────────────────────────────
  function submitApprove() {
    if (!scheduler) return;
    setStatus("Waiting for approval signature…");
    approve.writeContract({
      address: ENV.musd,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [scheduler, totalSpentCap],
    });
  }

  function submitCreate() {
    if (!scheduler) return;
    setStatus("Waiting for createSchedule signature…");
    const now = BigInt(Math.floor(Date.now() / 1000));
    create.writeContract({
      address: scheduler,
      abi: MUSDIRECT_DEBIT_ABI,
      functionName: "createSchedule",
      gas: 300_000n,
      args: [
        payee as Address,
        amount,
        BigInt(frequency),
        now,
        now + BigInt(expirySec),
        totalSpentCap,
        pctToCR(minCRPct),
      ],
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    if (needsApproval) submitApprove();
    else submitCreate();
  }

  if (!scheduler) {
    return (
      <div className="card text-sm text-mezo-mute">
        Set up form is disabled until <code className="code-inline">NEXT_PUBLIC_SCHEDULER_ADDRESS</code>{" "}
        is configured. Deploy MUSDirectDebit and set the env var.
      </div>
    );
  }

  const submitting =
    approve.isPending || approveReceipt.isFetching || create.isPending || createReceipt.isFetching;
  const submitLabel = needsApproval ? "Approve & create" : "Create schedule";

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div>
        <h3 className="mb-1 text-lg font-extrabold text-mezo-ink">+ New payment</h3>
        <p className="text-sm text-mezo-mute">
          One-time approval covers the full lifetime cap of this schedule. Cancel any time.
        </p>
      </div>

      <Field label="Payee address">
        <input
          required
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          placeholder="0x…"
          className="w-full rounded-lg border-2 border-[#1a1a1a]/15 bg-white px-3 py-2 font-mono text-sm focus:border-mezo-orange focus:outline-none"
        />
      </Field>

      <Field label="Amount (MUSD)">
        <input
          required
          type="text"
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="w-full rounded-lg border-2 border-[#1a1a1a]/15 bg-white px-3 py-2 font-mono text-sm focus:border-mezo-orange focus:outline-none"
        />
      </Field>

      <Field label="Frequency">
        <select
          value={frequency}
          onChange={(e) => setFrequency(Number(e.target.value))}
          className="w-full rounded-lg border-2 border-[#1a1a1a]/15 bg-white px-3 py-2 text-sm focus:border-mezo-orange focus:outline-none"
        >
          {FREQUENCY_OPTIONS.map((o) => (
            <option key={o.seconds} value={o.seconds}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Run for">
        <select
          value={expirySec}
          onChange={(e) => setExpirySec(Number(e.target.value))}
          className="w-full rounded-lg border-2 border-[#1a1a1a]/15 bg-white px-3 py-2 text-sm focus:border-mezo-orange focus:outline-none"
        >
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.seconds} value={o.seconds}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label={`Pause if my CR drops below ${minCRPct}%`}>
        <input
          type="range"
          min="120"
          max="400"
          step="5"
          value={minCRPct}
          onChange={(e) => setMinCRPct(Number(e.target.value))}
          className="w-full accent-mezo-orange"
        />
        <div className="mt-1 flex justify-between text-xs text-mezo-mute">
          <span>120% (aggressive)</span>
          <span>400% (conservative)</span>
        </div>
      </Field>

      <div className="rounded-xl border-2 border-mezo-orange/30 bg-orange-50 p-3 text-xs text-mezo-mute">
        <div className="flex justify-between">
          <span>Periods until expiry</span>
          <span className="font-mono font-bold">{periods}</span>
        </div>
        <div className="flex justify-between">
          <span>Lifetime cap</span>
          <span className="font-mono font-bold">
            {(Number(totalSpentCap) / 1e18).toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}{" "}
            MUSD
          </span>
        </div>
      </div>

      {status && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-700 animate-bounce">
          ✓ {status}
        </div>
      )}
      {(approve.error || create.error) && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
          {(approve.error?.message ?? create.error?.message ?? "").split("\n")[0]}
        </div>
      )}

      <button
        type="submit"
        disabled={!ready || submitting}
        className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Submitting…" : submitLabel}
      </button>

      {!payeeValid && payee.length > 0 && (
        <p className="text-xs text-red-600">Enter a valid payee address (not your own).</p>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-mezo-mute">
        {label}
      </span>
      {children}
    </label>
  );
}
