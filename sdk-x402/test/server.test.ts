import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";

import { createX402Middleware } from "../src/server.js";
import { PAYMENT_RECEIPT_HEADER } from "../src/types.js";
import * as verifyMod from "../src/verify.js";

const SCHEDULER = "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9" as Address;
const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as Address;
const RECIPIENT = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;

const baseCfg = {
  chainId: 31611,
  rpcUrl: "https://example.com",
  schedulerAddress: SCHEDULER,
  musdAddress: MUSD,
  recipient: RECIPIENT,
  amountMusd: 3n * 10n ** 18n,
  minSafeCR: 15n * 10n ** 17n,
};

function makeReq(opts: { headers?: Record<string, string>; url?: string } = {}): Request {
  return new Request(opts.url ?? "https://api.example.com/premium", {
    headers: opts.headers ?? {},
  });
}

describe("createX402Middleware", () => {
  it("returns 402 with PaymentRequired body when no receipt header is present", async () => {
    const requirePayment = createX402Middleware(baseCfg);
    const result = await requirePayment(makeReq());
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.response.status).toBe(402);
    const body = await result.response.json();
    expect(body.version).toBe("x402-musdirect-1");
    expect(body.scheme).toBe("musdirect-oneshot");
    expect(body.scheduler).toBe(SCHEDULER);
    expect(body.musd).toBe(MUSD);
    expect(body.recipient).toBe(RECIPIENT);
    expect(body.amount).toBe((3n * 10n ** 18n).toString());
    expect(body.minSafeCR).toBe((15n * 10n ** 17n).toString());
    expect(body.requestId).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("returns 400 for a malformed receipt header", async () => {
    const requirePayment = createX402Middleware(baseCfg);
    const result = await requirePayment(
      makeReq({ headers: { [PAYMENT_RECEIPT_HEADER]: "garbage" } })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
  });

  it("calls verifyOneShotReceipt and proceeds when the receipt is valid", async () => {
    const verifySpy = vi
      .spyOn(verifyMod, "verifyOneShotReceipt")
      .mockResolvedValue({
        ok: true,
        decoded: {
          requestId: ("0x" + "ab".repeat(32)) as `0x${string}`,
          payer: "0xf39Fd6e51aad88F6F4ce6aB8827279cfFFb92266" as Address,
          payee: RECIPIENT,
          troveOwner: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" as Address,
          amount: 3n * 10n ** 18n,
          fee: 7_500_000_000_000_000n,
          currentICR: 4n * 10n ** 18n,
        },
        txHash: ("0x" + "11".repeat(32)) as `0x${string}`,
      });

    const requirePayment = createX402Middleware(baseCfg);
    const txHash = "0x" + "11".repeat(32);
    const requestId = "0x" + "ab".repeat(32);
    const result = await requirePayment(
      makeReq({ headers: { [PAYMENT_RECEIPT_HEADER]: `${txHash}.${requestId}` } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.amount).toBe(3n * 10n ** 18n);
    verifySpy.mockRestore();
  });

  it("returns a fresh 402 on replay (same requestId used twice)", async () => {
    vi.spyOn(verifyMod, "verifyOneShotReceipt").mockResolvedValue({
      ok: true,
      decoded: {
        requestId: ("0x" + "ab".repeat(32)) as `0x${string}`,
        payer: "0xf39Fd6e51aad88F6F4ce6aB8827279cfFFb92266" as Address,
        payee: RECIPIENT,
        troveOwner: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" as Address,
        amount: 3n * 10n ** 18n,
        fee: 7_500_000_000_000_000n,
        currentICR: 4n * 10n ** 18n,
      },
      txHash: ("0x" + "11".repeat(32)) as `0x${string}`,
    });

    const requirePayment = createX402Middleware(baseCfg);
    const txHash = "0x" + "11".repeat(32);
    const requestId = "0x" + "ab".repeat(32);
    const headers = { [PAYMENT_RECEIPT_HEADER]: `${txHash}.${requestId}` };

    const first = await requirePayment(makeReq({ headers }));
    expect(first.ok).toBe(true);

    const second = await requirePayment(makeReq({ headers }));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.response.status).toBe(402);
    const body = await second.response.json();
    expect(body.reason).toBe("replay_detected");
  });
});
