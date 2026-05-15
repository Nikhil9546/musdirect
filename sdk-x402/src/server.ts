import { isAddress, type Address, type Hex } from "viem";

import {
  PAYMENT_RECEIPT_HEADER,
  type PaymentRequired,
  type RequirePaymentResult,
  type X402ServerConfig,
} from "./types.js";
import { createVerifyClient, verifyOneShotReceipt } from "./verify.js";

const DEFAULT_TROVE_OWNER_HEADER = "x-musdirect-trove-owner";

/// Factory that returns a `requirePayment(request)` function. The returned
/// function is fetch-style: pass a `Request`, get either `{ ok: true, info }`
/// to proceed or `{ ok: false, response }` to return the 402 to the client.
///
/// Use from Next.js App Router:
///
///     const requirePayment = createX402Middleware({ … });
///     export async function GET(req: NextRequest) {
///       const paid = await requirePayment(req);
///       if (!paid.ok) return paid.response;
///       return Response.json({ answer: "…" });
///     }
///
/// Works in any runtime with a `Request`/`Response` Fetch API (Node 20+,
/// Bun, Deno, Cloudflare Workers, Vercel Edge).
export function createX402Middleware(cfg: X402ServerConfig) {
  const client = createVerifyClient({ rpcUrl: cfg.rpcUrl, chainId: cfg.chainId });
  const seen = cfg.seenStore ?? new InMemoryStore();
  const troveOwnerHeader = cfg.troveOwnerHeader ?? DEFAULT_TROVE_OWNER_HEADER;

  return async function requirePayment(req: Request): Promise<RequirePaymentResult> {
    // Resolve the troveOwner — client-supplied via header, else default, else
    // we'll embed `0x0` and the client must override on retry.
    const troveOwnerHeaderValue = req.headers.get(troveOwnerHeader);
    const troveOwner: Address =
      troveOwnerHeaderValue && isAddress(troveOwnerHeaderValue)
        ? (troveOwnerHeaderValue as Address)
        : cfg.defaultTroveOwner ?? ("0x0000000000000000000000000000000000000000" as Address);

    const receiptHeader = req.headers.get(PAYMENT_RECEIPT_HEADER);

    if (!receiptHeader) {
      // No receipt → issue a fresh challenge.
      return { ok: false, response: makeChallenge(cfg, troveOwner, req) };
    }

    // Parse the receipt. We accept `<txHash>.<requestId>` for simplicity.
    const [txHash, requestId] = receiptHeader.split(".") as [Hex, Hex];
    if (!isHex32(txHash) || !isHex32(requestId)) {
      return {
        ok: false,
        response: jsonError(400, {
          error: "malformed_receipt",
          help: `expected '<txHash>.<requestId>' in header ${PAYMENT_RECEIPT_HEADER}`,
        }),
      };
    }

    if (await seen.has(requestId)) {
      // Already consumed — issue a fresh challenge so the client pays again.
      return { ok: false, response: makeChallenge(cfg, troveOwner, req, "replay_detected") };
    }

    const result = await verifyOneShotReceipt(client, txHash, {
      requestId,
      schedulerAddress: cfg.schedulerAddress,
      recipient: cfg.recipient,
      minAmount: cfg.amountMusd,
      expectedTroveOwner: troveOwner !== "0x0000000000000000000000000000000000000000" ? troveOwner : undefined,
    });

    if (!result.ok) {
      return {
        ok: false,
        response: makeChallenge(cfg, troveOwner, req, result.reason),
      };
    }

    await seen.add(requestId);
    return {
      ok: true,
      info: {
        requestId,
        txHash,
        payer: result.decoded.payer,
        payee: result.decoded.payee,
        troveOwner: result.decoded.troveOwner,
        amount: result.decoded.amount,
        currentICR: result.decoded.currentICR,
      },
    };
  };
}

function makeChallenge(
  cfg: X402ServerConfig,
  troveOwner: Address,
  req: Request,
  reason?: string
): Response {
  const body: PaymentRequired & { reason?: string; previousAttempt?: string } = {
    version: "x402-musdirect-1",
    scheme: "musdirect-oneshot",
    chainId: cfg.chainId,
    scheduler: cfg.schedulerAddress,
    musd: cfg.musdAddress,
    recipient: cfg.recipient,
    troveOwner,
    amount: cfg.amountMusd.toString(),
    minSafeCR: cfg.minSafeCR.toString(),
    requestId: generateRequestId(req),
    human: `Pay ${formatMusd(cfg.amountMusd)} MUSD on chain ${cfg.chainId} to access ${
      cfg.endpointLabel ?? new URL(req.url).pathname
    }. Payment auto-refused if your Trove CR drops below ${formatPct(cfg.minSafeCR)}.`,
    ...(reason ? { reason } : {}),
  };

  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "x-musdirect-version": "x402-musdirect-1",
    },
  });
}

function jsonError(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function generateRequestId(req: Request): Hex {
  // 256-bit random — collision-resistant and easy for the client to echo back.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Buffer.from(bytes).toString("hex")) as Hex;
  void req;
}

function isHex32(s: string | undefined): s is Hex {
  return typeof s === "string" && /^0x[0-9a-fA-F]{64}$/.test(s);
}

function formatMusd(amount: bigint): string {
  const whole = amount / 10n ** 18n;
  const frac = (amount % 10n ** 18n) / 10n ** 14n; // 4-dp
  const fracStr = String(frac).padStart(4, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : String(whole);
}

function formatPct(cr1e18: bigint): string {
  const pct = Number((cr1e18 * 10_000n) / 10n ** 18n) / 100;
  return `${pct.toFixed(0)}%`;
}

class InMemoryStore {
  private set = new Set<string>();
  has(id: Hex): boolean { return this.set.has(id.toLowerCase()); }
  add(id: Hex): void { this.set.add(id.toLowerCase()); }
}
