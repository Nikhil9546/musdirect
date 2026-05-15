// Premium API endpoint — gated by @musdirect/x402.
//
// First call: returns 402 Payment Required + a fresh requestId.
// Client signs executeOneShot, retries with the receipt header.
// Server verifies the on-chain receipt, then serves the response.
//
// This is the API-server side of the x402 demo. The client side lives at
// /demo-api/page.tsx.

import type { NextRequest } from "next/server";

import { createX402Middleware } from "@musdirect/x402";

import { ENV } from "@/lib/env";

// The middleware is created once per module load. The in-memory `seen` store
// persists for the lifetime of the route worker, which is enough for a demo.
// For production: pass a Redis-backed store via `seenStore`.
//
// If the scheduler isn't deployed, the route still functions but every call
// returns 402 with a zero scheduler address (clients can detect this and fall
// back gracefully).
const requirePayment = createX402Middleware({
  chainId: ENV.chainId,
  rpcUrl: ENV.rpcUrl,
  schedulerAddress: ENV.scheduler ?? "0x0000000000000000000000000000000000000000",
  musdAddress: ENV.musd,
  recipient: ENV.recipient ?? ENV.musd, // placeholder — set via env in production
  amountMusd: 3n * 10n ** 18n,
  minSafeCR: 15n * 10n ** 17n, // 150%
  endpointLabel: "/api/premium",
});

const PROMPTS = [
  "What's the marginal cost of a single GPT-grade completion in 2026?",
  "Summarize Mezo's monetary policy in one sentence.",
  "If BTC drops 30%, what happens to a Trove at 180% CR?",
];

function fakeLLMAnswer(prompt: string): string {
  // Determinstic placeholder — we're not paying real inference dollars in a demo.
  if (prompt.toLowerCase().includes("mezo")) {
    return "Mezo issues MUSD against BTC collateral on a Liquity-fork CDP at a 1% origination fee, with a 110% liquidation threshold and Recovery Mode at TCR < 150%.";
  }
  if (prompt.toLowerCase().includes("btc drops")) {
    return "A 30% BTC drop on a 180% CR Trove drops CR to ~126%. Still above the 110% liquidation threshold, but in Recovery Mode (TCR < 150%) the effective floor becomes 150% — that Trove would be subject to liquidation.";
  }
  return "Inference cost in 2026 sits around $0.002 per million input tokens for frontier models, dropping ~5x year-over-year.";
}

export async function GET(req: NextRequest) {
  const paid = await requirePayment(req);
  if (!paid.ok) return paid.response;

  // Payment verified — serve the premium content.
  const prompt = req.nextUrl.searchParams.get("prompt") ?? PROMPTS[0]!;
  const answer = fakeLLMAnswer(prompt);

  return Response.json(
    {
      prompt,
      answer,
      payment: {
        requestId: paid.info.requestId,
        txHash: paid.info.txHash,
        payer: paid.info.payer,
        troveOwner: paid.info.troveOwner,
        amount: paid.info.amount.toString(),
        currentICR: paid.info.currentICR.toString(),
      },
    },
    {
      headers: { "x-musdirect-payment-verified": "true" },
    }
  );
}
