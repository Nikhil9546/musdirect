"use client";

import { useState } from "react";
import { useAccount, useChainId, useConfig, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getPublicClient } from "wagmi/actions";
import type { Hex } from "viem";

import { fetchWith402, PAYMENT_RECEIPT_HEADER, type PaymentRequired } from "@musdirect/x402";

import { Header } from "@/components/Header";
import { ENV } from "@/lib/env";

// /demo-api — the API-side twin of /demo.
//
// Shows the full x402 round-trip:
//   1. GET /api/premium  → 402 with PaymentRequired body
//   2. Sign executeOneShot via the wallet → tx lands on Mezo testnet
//   3. Retry GET /api/premium with the X-Musdirect-Payment header → 200 with the answer
//
// Per PRD §5 differentiator #6 (unification thesis): every MUSD payment on
// Mezo — recurring (rent) or reactive (x402) — runs through the same CR gate.

interface FlowStep {
  label: string;
  status: "pending" | "running" | "ok" | "fail";
  detail?: string;
}

const PROMPT_OPTIONS = [
  "Summarize Mezo's monetary policy in one sentence.",
  "If BTC drops 30%, what happens to a Trove at 180% CR?",
  "What's the marginal cost of a single GPT-grade completion in 2026?",
] as const;

export default function DemoApiPage() {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();

  const [prompt, setPrompt] = useState<string>(PROMPT_OPTIONS[0]);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ txHash: Hex; requestId: Hex } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pushStep(s: FlowStep) {
    setSteps((prev) => [...prev, s]);
  }
  function patchLast(patch: Partial<FlowStep>) {
    setSteps((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last) copy[copy.length - 1] = { ...last, ...patch };
      return copy;
    });
  }

  async function runDemo() {
    if (!walletClient || !address) return;
    setSteps([]);
    setAnswer(null);
    setPayment(null);
    setErr(null);
    setBusy(true);

    try {
      const url = `/api/premium?prompt=${encodeURIComponent(prompt)}`;

      // Step 1: the unpaid call.
      pushStep({ label: "GET /api/premium (no payment)", status: "running" });
      const first = await fetch(url);
      if (first.status !== 402) {
        patchLast({ status: "fail", detail: `unexpected status ${first.status}` });
        return;
      }
      const pr = (await first.json()) as PaymentRequired;
      patchLast({
        status: "ok",
        detail: `402 — pay ${formatMusd(pr.amount)} MUSD to ${shorten(pr.recipient)} (CR ≥ ${formatPct(pr.minSafeCR)})`,
      });

      // Step 2: settle on-chain.
      pushStep({ label: "Sign executeOneShot on Mezo testnet", status: "running" });
      const publicClient = getPublicClient(config, { chainId });
      if (!publicClient) throw new Error("no public client");
      const retried = await fetchWith402(url, {
        walletClient,
        publicClient,
        troveOwner: address,
      });
      // The helper already retried — extract receipt from its headers.
      const receiptHeader = retried.headers.get(PAYMENT_RECEIPT_HEADER) ?? "";
      const [txHash, requestId] = receiptHeader.split(".") as [Hex, Hex];
      patchLast({
        status: "ok",
        detail: txHash ? `Tx ${shorten(txHash)} landed; requestId ${shorten(requestId)}` : "tx settled",
      });

      // Step 3: the paid response.
      pushStep({ label: "Server verifies + serves response", status: "running" });
      if (retried.status !== 200) {
        const errBody = await retried.json().catch(() => ({}));
        patchLast({
          status: "fail",
          detail: `${retried.status} — ${JSON.stringify(errBody).slice(0, 120)}`,
        });
        return;
      }
      const body = await retried.json();
      patchLast({ status: "ok", detail: "200 OK" });
      setAnswer(body.answer);
      if (txHash && requestId) setPayment({ txHash, requestId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      patchLast({ status: "fail", detail: msg.split("\n")[0] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto max-w-4xl px-6 py-16">
        <section className="mb-10">
          <span className="btn-accent mb-6 inline-flex text-xs">
            Powered by @musdirect/x402
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-mezo-ink md:text-5xl">
            Premium API. Pay-as-you-go in MUSD.
          </h1>
          <p className="mt-4 max-w-2xl text-mezo-mute md:text-lg">
            Every call costs 3 MUSD. The server returns <code className="code-inline">402 Payment Required</code>;
            your wallet pays on Mezo; the server verifies + serves. <strong>Crucially</strong>,
            the payment refuses if your Trove&apos;s CR is below your threshold —
            an agent never accidentally drains its owner toward liquidation.
          </p>
        </section>

        {!isConnected && (
          <div className="card mb-8 text-center">
            <p className="mb-2 text-xl font-extrabold text-mezo-ink">
              Connect a wallet to try the demo
            </p>
            <p className="mx-auto mb-6 max-w-md text-mezo-mute">
              You&apos;ll send a real tx on Mezo testnet. Make sure you have testBTC
              for gas and some MUSD to spend.
            </p>
            <div className="inline-block">
              <ConnectButton label="Connect wallet" />
            </div>
          </div>
        )}

        {isConnected && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-lg font-extrabold text-mezo-ink">Make a call</h2>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-mezo-mute">
                  Prompt
                </span>
                <select
                  className="w-full rounded-lg border-2 border-[#1a1a1a]/15 bg-white px-3 py-2 text-sm"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                >
                  {PROMPT_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={runDemo}
                disabled={busy || !ENV.scheduler}
                className="btn-primary mt-5 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy
                  ? "Running…"
                  : ENV.scheduler
                    ? "Call /api/premium (3 MUSD)"
                    : "Scheduler not deployed"}
              </button>

              <p className="mt-3 text-xs text-mezo-mute">
                You&apos;ll be asked to sign two txs on first use: an MUSD approval
                for the scheduler, then the actual <code className="code-inline">executeOneShot</code>.
                Subsequent calls only sign the second.
              </p>
            </div>

            <div className="card">
              <h2 className="mb-3 text-lg font-extrabold text-mezo-ink">Flow</h2>
              {steps.length === 0 && (
                <p className="text-sm text-mezo-mute">
                  Click the button. The three steps will appear here in order.
                </p>
              )}
              <ol className="space-y-3">
                {steps.map((s, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex items-baseline gap-2">
                      <StepIcon status={s.status} />
                      <span className="font-semibold text-mezo-ink">{s.label}</span>
                    </div>
                    {s.detail && (
                      <p className="ml-7 mt-0.5 font-mono text-xs text-mezo-mute">
                        {s.detail}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {answer && (
              <div className="card md:col-span-2">
                <h2 className="mb-2 text-lg font-extrabold text-mezo-ink">Answer</h2>
                <p className="text-mezo-ink">{answer}</p>
                {payment && (
                  <p className="mt-3 font-mono text-xs text-mezo-mute">
                    Verified by tx {shorten(payment.txHash)} · requestId {shorten(payment.requestId)}
                  </p>
                )}
              </div>
            )}

            {err && (
              <div className="card md:col-span-2 border-red-300 bg-red-50">
                <p className="text-sm text-red-700">{err.split("\n")[0]}</p>
              </div>
            )}
          </div>
        )}

        <section className="mt-16 rounded-2xl border-2 border-[#1a1a1a] bg-[#1a1a1a] p-6 font-mono text-sm text-gray-200">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-mezo-orange">
            Server integration — 6 lines
          </p>
          <pre className="overflow-x-auto text-xs leading-relaxed">{`import { createX402Middleware } from "@musdirect/x402";

const requirePayment = createX402Middleware({
  chainId: 31611,
  schedulerAddress: "0x…",
  recipient: "0x…",
  amountMusd: 3n * 10n ** 18n,
  minSafeCR: 1_500000000000000000n,
});

export async function GET(req) {
  const paid = await requirePayment(req);
  if (!paid.ok) return paid.response;
  return Response.json({ answer: "…" });
}`}</pre>
        </section>

        <p className="mt-8 text-center text-xs text-mezo-mute">
          <a href="/" className="underline">Back to MUSDirect</a> · This is a fictional
          API. The CR gate, on-chain payment, and 402 handling are all real.
        </p>
      </main>
    </div>
  );
}

function StepIcon({ status }: { status: FlowStep["status"] }) {
  const cls =
    status === "ok"
      ? "bg-emerald-500"
      : status === "fail"
        ? "bg-red-500"
        : status === "running"
          ? "bg-amber-400"
          : "bg-mezo-mute/30";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function shorten(hex: string | undefined): string {
  if (!hex) return "—";
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`;
}

function formatMusd(amountStr: string): string {
  const v = BigInt(amountStr);
  return (Number(v) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatPct(cr1e18Str: string): string {
  const v = BigInt(cr1e18Str);
  const pct = Number((v * 10_000n) / 10n ** 18n) / 100;
  return `${pct.toFixed(0)}%`;
}
