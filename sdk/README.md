# @musdirect/sdk

Drop-in `<SubscribeButton />` for embedding MUSDirect Debit recurring payments
into any Mezo dApp. Six lines of integration:

```tsx
import { SubscribeButton } from "@musdirect/sdk";

<SubscribeButton
  schedulerAddress="0x…MUSDirectDebit"
  payee="0x…yourDappRevenueWallet"
  amount={29_000000000000000000n}      // 29 MUSD per period
  frequency={30n * 86400n}              // monthly
  totalSpentCap={29n * 12n * 10n**18n}  // 12 months
  minSafeCR={2_500000000000000000n}     // 250%
/>
```

The button:

1. Checks `MUSD.allowance(user, scheduler)`. If insufficient, prompts an approval.
2. Once approved, calls `MUSDirectDebit.createSchedule(...)`.
3. Renders the through-states: `Approve & Subscribe with MUSD` → `Approving…` →
   `Creating schedule…` → `Subscribed ✓`.

## Why this is the moat (per PRD §5)

Every dApp that ships with the SubscribeButton gets MUSDirect Debit's CR-gated
execution **for free** — without re-implementing the scheduler, the keeper, or
the Recovery Mode floor. The dApp's revenue becomes a stream that auto-pauses
when its payer's Trove approaches liquidation, which is the right behavior for
*both* sides of the relationship.

## Peer deps

`react@18` · `wagmi@2` · `viem@2`. The SDK reuses the host's wagmi config — no
provider duplication. The host must already wrap its tree in `WagmiProvider` +
`QueryClientProvider` (which any wagmi v2 app does).

## Build

```sh
pnpm install
pnpm build       # emits dist/
```

## Try it locally

See `frontend/src/app/demo-gym/page.tsx` — a minimal "gym dApp" page that
imports the SubscribeButton and demos the full flow.
