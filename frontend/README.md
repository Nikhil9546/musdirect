# @musdirect/frontend

Next.js 14 + wagmi v2 + Mezo Passport. The web UI for MUSDirect Debit.

## Status — Connect flow

Done in this milestone:

- Mezo Passport SDK wired up (`@mezo-org/passport@0.17.2`) — pre-configures wagmi
  with Bitcoin wallets (Unisat, OKX, Xverse) and the standard EVM wallets
  through RainbowKit, all on the right Mezo chain (testnet by default).
- RainbowKit `<ConnectButton />` in the header — gets the Mezo-native wallet
  picker for free.
- **Trove health card** — reads the connected user's ICR, the live BTC price,
  and Recovery Mode status from the real Mezo testnet contracts via wagmi
  `useReadContracts` (multicall). Renders the user's MUSD balance too.
  Shows a contextual hint when the user has no Trove (ICR = ∞).
- **Scheduler status card** — surfaces whether MUSDirectDebit is deployed; if
  not, points the user at `keeper/scripts/deploy-and-tick.sh`.

Coming next sessions per PRD §14 Week 4:

- "Set up payment" form (`createSchedule` + ERC-20 approve in one batched tx)
- Schedule list with status, next-execution timer, last 5 executions
- "Safe headroom" widget — "you can absorb a 64% BTC drop before any payment pauses"
- Full Mezo Passport `<Dropdown />` integration (mats, Mezo ID, etc.)

## Run locally

```sh
pnpm install
cp .env.example .env.local        # then fill in NEXT_PUBLIC_SCHEDULER_ADDRESS once deployed
pnpm dev                          # http://localhost:3000
```

The page renders without `NEXT_PUBLIC_SCHEDULER_ADDRESS` set; the scheduler card
just shows the deploy-prompt instead of schedule data. `MUSD_ADDRESS`,
`TROVE_MANAGER_ADDRESS`, and `PRICE_FEED_ADDRESS` default to the live Mezo
testnet addresses verified on 2026-05-04.

For a real wallet picker that includes WalletConnect, set
`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to a real Reown Cloud project id. Without
it, only browser-injected wallets work.

## Layout

```
src/
├── app/
│   ├── layout.tsx              root, applies dark Tailwind shell
│   ├── globals.css             Tailwind base + Mezo dark colors
│   ├── page.tsx                home — hero, connection state, two cards
│   ├── providers.tsx           thin wrapper that loads providers-client with ssr:false
│   └── providers-client.tsx    Wagmi + Query + RainbowKit + Passport stack
├── components/
│   ├── Header.tsx              brand + ConnectButton
│   ├── TroveHealthCard.tsx     CR, MUSD balance, RM status, no-trove hint
│   └── SchedulerStatusCard.tsx deploy prompt or address summary
└── lib/
    ├── env.ts                  validated env access (throws fast on misconfig)
    ├── wagmi.ts                buildWagmiConfig() — lazy, client-only
    ├── abis.ts                 ERC20 + TroveManager + PriceFeed view subsets
    └── format.ts               address / token / CR / USD formatting
```

## SSR boundary, why

Mezo Passport composes RainbowKit + OrangeKit + several wallet connectors. At
import time they sniff `window` for injected providers, which crashes Next.js
SSR with `ReferenceError: window is not defined`. We wall the entire wagmi tree
behind `next/dynamic({ ssr: false })`, so the server only renders the static
shell and the wallet-aware UI mounts on the client. This costs us SSR for
connect-state UI but eliminates a class of hydration mismatch bugs at the same
time.

## Live data path

```
Browser ─ wagmi useReadContracts ─ Mezo testnet RPC
                                   ├─ TroveManager.getCurrentICR(addr, price)
                                   ├─ TroveManager.checkRecoveryMode(price)
                                   └─ MUSD.balanceOf(addr)
       ─ wagmi useReadContract  ─ ├─ PriceFeed.fetchPrice()  (read-as-view)
```

No frontend deps on the Foundry artifacts; the ABI subsets are hand-curated
in `src/lib/abis.ts`. Keep them in sync with the Solidity source if you change
the contract surface.
