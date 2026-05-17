"use client";

import { useState } from "react";
import {
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { ENV } from "@/lib/env";
import { MUSDIRECT_DEBIT_ABI, STATUS_ACTIVE, STATUS_PAUSED, statusLabel } from "@/lib/abis";
import { useUserSchedules, type Schedule } from "@/lib/schedules";
import { fmtAddress, fmtCR, fmtRelative, fmtToken } from "@/lib/format";
import { WalrusMascot } from "./WalrusMascot";

export function SchedulesList() {
  const { schedules, loading, error, refetch } = useUserSchedules();

  if (!ENV.scheduler) return null;

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-extrabold text-mezo-ink">Your schedules</h3>
          <p className="text-xs text-mezo-mute">
            Live from MUSDirectDebit. Discovered via <code className="font-mono">ScheduleCreated</code> events.
          </p>
        </div>
        <button
          onClick={refetch}
          className="rounded-full border-2 border-[#1a1a1a] bg-white px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-red-600">Sync Error</p>
          <p className="mt-1 text-xs text-red-700">
            {error.includes("maximum [from, to] blocks distance")
              ? "The RPC node is limiting the block range. We're fetching in chunks, but some history might be missing."
              : error.split(".")[0] + "."}
          </p>
          <button
            onClick={refetch}
            className="mt-2 text-[10px] font-bold uppercase tracking-widest text-red-600 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && schedules.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#1a1a1a]/10 bg-gray-50/50 py-10 px-4 text-center">
          <div className="mb-4 grayscale opacity-20">
            <WalrusMascot className="w-16 h-16" />
          </div>
          <p className="max-w-[200px] text-sm font-medium text-mezo-mute">
            No active schedules found for your wallet.
          </p>
          <p className="mt-1 text-xs text-mezo-mute/60">
            Create one to see it live here.
          </p>
        </div>
      )}

      {loading && schedules.length === 0 && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border-2 border-[#1a1a1a]/5 bg-gray-50" />
          ))}
        </div>
      )}

      <ul className="space-y-3">
        {schedules.map((s) => (
          <ScheduleRow key={String(s.id)} schedule={s} onChanged={refetch} />
        ))}
      </ul>
    </div>
  );
}

function ScheduleRow({ schedule, onChanged }: { schedule: Schedule; onChanged: () => void }) {
  const [busy, setBusy] = useState<"cancel" | "pause" | "resume" | null>(null);
  const cancel = useWriteContract();
  const cancelReceipt = useWaitForTransactionReceipt({ hash: cancel.data });
  const pauseW = useWriteContract();
  const pauseReceipt = useWaitForTransactionReceipt({ hash: pauseW.data });
  const resumeW = useWriteContract();
  const resumeReceipt = useWaitForTransactionReceipt({ hash: resumeW.data });

  // Trigger refresh when any of the three lifecycle writes lands.
  if ((cancelReceipt.isSuccess || pauseReceipt.isSuccess || resumeReceipt.isSuccess) && busy) {
    setBusy(null);
    onChanged();
  }

  const scheduler = ENV.scheduler!;
  const inProgress = busy !== null;
  const isActive = schedule.status === STATUS_ACTIVE;
  const isPaused = schedule.status === STATUS_PAUSED;

  function doCancel() {
    setBusy("cancel");
    cancel.writeContract({
      address: scheduler,
      abi: MUSDIRECT_DEBIT_ABI,
      functionName: "cancelSchedule",
      args: [schedule.id],
    });
  }
  function doPause() {
    setBusy("pause");
    pauseW.writeContract({
      address: scheduler,
      abi: MUSDIRECT_DEBIT_ABI,
      functionName: "pauseSchedule",
      args: [schedule.id],
    });
  }
  function doResume() {
    setBusy("resume");
    resumeW.writeContract({
      address: scheduler,
      abi: MUSDIRECT_DEBIT_ABI,
      functionName: "resumeSchedule",
      args: [schedule.id],
    });
  }

  const errMsg =
    cancel.error?.message ?? pauseW.error?.message ?? resumeW.error?.message;

  return (
    <li className="rounded-xl border-2 border-[#1a1a1a]/15 bg-white p-4 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-xs text-mezo-mute">#{String(schedule.id)}</span>
          <span className="font-bold text-mezo-ink">
            {fmtToken(schedule.amount, 18, 2)} MUSD
          </span>
          <span className="text-xs text-mezo-mute">→</span>
          <span className="font-mono text-xs">{fmtAddress(schedule.payee)}</span>
        </div>
        <StatusPill status={schedule.status} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-mezo-mute">Frequency</dt>
        <dd className="text-right font-mono">{Math.round(Number(schedule.frequency) / 86_400)}d</dd>

        <dt className="text-mezo-mute">Next execution</dt>
        <dd className="text-right font-mono">{fmtRelative(schedule.nextExec)}</dd>

        <dt className="text-mezo-mute">Pauses below CR</dt>
        <dd className="text-right font-mono">{fmtCR(schedule.minSafeCR)}</dd>

        <dt className="text-mezo-mute">Spent / cap</dt>
        <dd className="text-right font-mono">
          {fmtToken(schedule.totalSpent, 18, 0)} / {fmtToken(schedule.totalSpentCap, 18, 0)}
        </dd>

        {schedule.failureCount > 0 && (
          <>
            <dt className="text-red-600">Consec. CR fails</dt>
            <dd className="text-right font-mono text-red-600">{schedule.failureCount}/3</dd>
          </>
        )}
      </dl>

      {(isActive || isPaused) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isActive && (
            <button
              onClick={doPause}
              disabled={inProgress}
              className="rounded-full border-2 border-[#1a1a1a] bg-white px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {busy === "pause" ? "…" : "Pause"}
            </button>
          )}
          {isPaused && (
            <button
              onClick={doResume}
              disabled={inProgress}
              className="rounded-full border-2 border-mezo-orange bg-mezo-orange px-3 py-1 text-xs font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {busy === "resume" ? "…" : "Resume"}
            </button>
          )}
          <button
            onClick={doCancel}
            disabled={inProgress}
            className="rounded-full border-2 border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {busy === "cancel" ? "…" : "Cancel"}
          </button>
        </div>
      )}

      {errMsg && <p className="mt-2 text-xs text-red-600">{errMsg.split("\n")[0]}</p>}
    </li>
  );
}

function StatusPill({ status }: { status: number }) {
  const tone =
    status === STATUS_ACTIVE
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : status === STATUS_PAUSED
        ? "border-amber-300 bg-amber-50 text-amber-700"
        : "border-red-300 bg-red-50 text-red-700";
  return (
    <span className={`rounded-full border-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}
