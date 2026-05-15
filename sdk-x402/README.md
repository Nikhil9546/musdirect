# @musdirect/x402

HTTP `402 Payment Required` middleware + client helpers for MUSDirect Debit on
Mezo. Turn any API endpoint into a CR-gated pay-per-call resource: the payer's
Trove collateral ratio is checked before settlement, so AI agents never
accidentally drain their owner toward liquidation.

## Server — Next.js App Router (or anything Fetch-API)

```ts
import { createX402Middleware } from "@musdirect/x402";

const requirePayment = createX402Middleware({
  chainId: 31611,
  rpcUrl: "https://rpc.test.mezo.org",
  schedulerAddress: "0x…MUSDirectDebit",
  musdAddress: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  recipient: "0x…yourRevenue",
  amountMusd: 3n * 10n ** 18n,   // 3 MUSD per call
  minSafeCR: 1_500_000000000000000n, // 150%
});

export async function GET(req: Request) {
  const paid = await requirePayment(req);
  if (!paid.ok) return paid.response;  // 402 with PaymentRequired body
  return Response.json({ answer: "…premium content…" });
}
```

That's it. The middleware:

1. On a request with no payment header, returns `402` with a fresh `requestId`.
2. On a retry with `X-Musdirect-Payment: <txHash>.<requestId>`, fetches the tx receipt, decodes the `OneShotPaid` event, verifies it matches (recipient, amount, requestId), and calls `next()`.
3. Tracks accepted requestIds in memory (default) so the same receipt can't satisfy two API calls. Replace the default `seenStore` with a Redis-backed one in production.

## Client — wagmi WalletClient

```ts
import { fetchWith402 } from "@musdirect/x402";
import { useWalletClient, useConfig, useChainId } from "wagmi";
import { getPublicClient } from "wagmi/actions";

const { data: walletClient } = useWalletClient();
const config = useConfig();
const chainId = useChainId();
const publicClient = getPublicClient(config, { chainId });

const res = await fetchWith402("/api/premium?prompt=…", {
  walletClient,
  publicClient,
  troveOwner: address, // gate by this address's Trove CR
});
const body = await res.json();
```

`fetchWith402` handles the full round-trip:

1. `fetch` the URL.
2. If `402` → parse `PaymentRequired`, write `MUSD.approve` (if needed), write `MUSDirectDebit.executeOneShot`, wait for confirmation.
3. Retry the original request with `X-Musdirect-Payment: <txHash>.<requestId>`.
4. Return the final `Response`.

For finer-grained control, use the lower-level `x402Pay(...)` to settle but handle the retry yourself.

## Why the CR gate matters

x402 is great for AI agents paying per-API-call. But an agent isn't accountable to the world — its **owner** is. If the agent's spending pushes the owner's Trove toward liquidation, the loss falls on the human.

`@musdirect/x402` plugs the owner's Trove ICR into the agent's payment authorization. Specify `troveOwner` in the call; the on-chain `executeOneShot` revert if the owner's CR is below `minSafeCR`. The middleware returns a contextual 402 to the agent, who can choose to retry later, alert the owner, or fall back.

**No other x402 implementation in the wild does this.** Stripe's stablecoin subs and the Coinbase x402 reference implementation both settle on custodial USDC with no CDP awareness. This is uniquely possible on Mezo because MUSD is a CDP-issued stablecoin.

## Reference

| Export | Purpose |
|---|---|
| `createX402Middleware(opts)` | Server middleware factory. Returns `requirePayment(req)`. |
| `x402Pay({ walletClient, publicClient, paymentRequired, troveOwner? })` | Settle a 402 challenge on-chain. Handles allowance + executeOneShot. |
| `fetchWith402(url, init)` | End-to-end: fetch, settle, retry. Returns final `Response`. |
| `verifyOneShotReceipt(client, txHash, expectation)` | Low-level receipt verifier. Used internally by the middleware. |
| `MUSDIRECT_ONESHOT_ABI` | Minimal ABI for `executeOneShot` + `OneShotPaid` event. |
| `PAYMENT_RECEIPT_HEADER` | The header name (`x-musdirect-payment`) clients use to send the receipt back. |

## Build + test

```sh
pnpm install
pnpm test          # 12 vitest tests
pnpm build         # emits dist/
```
