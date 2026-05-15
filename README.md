# MUSDirect Debit

Collateral-aware recurring MUSD payments on Mezo. Auto-pay rent / SaaS / payroll
without risking your Bitcoin — every scheduled execution reads the payer's Trove
ICR first and refuses payments that would push them toward liquidation.

Hackathon: **Mezo Hackathon: Building Bitcoin's Future** — MUSD Track.
PRD: see `../output/PRD-2026-05-01.md` (and the v2-corrected PDF).

## Repo layout

```
musdirect/
├── contracts/        Foundry project — MUSDirectDebit.sol + fork tests (24/24)
├── keeper/           Node + viem cron service + live testnet validation script
├── frontend/         Next.js 14 + wagmi v2 + Mezo Passport (4 routes)
├── sdk/              @musdirect/sdk — <SubscribeButton/> for recurring dApps
└── sdk-x402/         @musdirect/x402 — HTTP 402 middleware for reactive APIs
```

## Status — through Week 4

### Done

- [x] **Foundry project** + OpenZeppelin + verified Mezo dependency interfaces
- [x] **`MUSDirectDebit.sol`** — schedule lifecycle, CR-gated execution, Recovery
      Mode floor (155%), per-schedule allowance accounting, 3-failure auto-cancel,
      reentrancy guard, fee accounting (25 bps capped at 5 MUSD)
- [x] **MEZO integration (PRD §15 path)** — optional `IERC20 mezo` constructor
      param + `fundMezoTreasury()` (anyone can fund) + per-execute drip to the
      keeper. Cleanly no-op when `mezo == address(0)`.
- [x] **Day-2 ABI verification** — `checkRecoveryMode` lives on `TroveManager`,
      not `BorrowerOperations`. Interface, contract, deploy script all corrected.
- [x] **All mocks deleted** — no `MockMUSD`, `MockTroveManager`, etc.
- [x] **24/24 fork tests** against live Mezo testnet (chain id 31611). Edge cases
      use Foundry's `vm.mockCall` cheat code to override specific return values
      on the real deployed contracts — no deployed mock contracts. Coverage now
      includes the `executeOneShot` reactive primitive (7 dedicated tests).
- [x] **Live verify harness** — `keeper/scripts/verify-testnet.sh` calls every
      ABI MUSDirectDebit depends on; latest run: 171 active Troves, BTC ~$80.2K,
      RM off, MUSD supply 1.37B.
- [x] **`@musdirect/keeper`** — viem + node-cron service with retry/backoff +
      revert classification (TooEarly retryable, ScheduleNotActive fatal).
      15/15 unit tests.
- [x] **Deploy + run harness** — `keeper/scripts/deploy-and-tick.sh` runs the
      full path end-to-end against real testnet when given a funded wallet.
- [x] **Frontend connect flow** — Next.js 14 + wagmi v2 + Mezo Passport.
      Bitcoin + EVM wallets via OrangeKit/RainbowKit. Hard SSR boundary on the
      provider stack.
- [x] **Trove-health dashboard** — live ICR / RM status / MUSD balance / BTC
      price + **safe-headroom** calculation ("you can absorb an N% BTC drop
      before any payment pauses") — the load-bearing visual per PRD §6 P0-6.
- [x] **Create Schedule form** — payee + amount + frequency + expiry + minSafeCR
      slider. Batched `approve` + `createSchedule` via wagmi `useWriteContract`.
- [x] **Schedule list** — event-discovered, with status pills, next-execution
      countdown, and inline cancel / pause / resume actions.
- [x] **Validation experiment 1** — `keeper/scripts/trove-distribution`
      enumerates all 171 testnet Troves and prints a CR histogram. Live result:
      median 152%, p25 132%, p75 187%. Form default lowered from 250% to 150%
      to match the actual borrower base.
- [x] **`@musdirect/sdk`** — drop-in `<SubscribeButton/>` React component for
      third-party Mezo dApps. Six-line integration.
- [x] **MezoGym demo** — fake gym dApp at `/demo-gym` showing the SDK
      integration in production. Three pricing tiers, working Subscribe button.
- [x] **`@musdirect/x402`** — HTTP `402 Payment Required` middleware +
      client helper + on-chain receipt verifier. Works in any Fetch-API
      runtime (Next.js, Express, Bun, Deno, Cloudflare). 12/12 unit tests pass.
- [x] **Premium API demo** — `/api/premium` route gated by `@musdirect/x402`
      and `/demo-api` page that demonstrates the full 402 → sign → retry → response
      flow. Live 402 verified end-to-end: `curl /api/premium` returns the
      PaymentRequired body with a fresh requestId.
- [x] **Unification thesis** — `MUSDirectDebit.sol` exposes both
      `executePayment` (recurring) and `executeOneShot` (reactive), sharing every
      line of CR-gate, Recovery Mode, fee, and MEZO drip logic. Pitch line:
      *every MUSD payment on Mezo runs through the same collateral-aware gate*.

### Out of session — requires you, not code

- [ ] Deploy `MUSDirectDebit` to Mezo testnet with a funded wallet
      (`keeper/scripts/deploy-and-tick.sh`)
- [ ] Open a real Trove for the test payer; create a real schedule; observe a
      real MUSD payment land via the keeper
- [ ] 1:1 user interviews (5 Mezo borrowers — PRD §13 experiment 2)
- [ ] dApp SDK cold outreach (10 Mezo dApp builders — PRD §13 experiment 3)
- [ ] Week 6 demo polish: 3-minute Loom, Mirror post, KYB paperwork

## Build & test

```sh
# Contracts
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-git --shallow  # one-time
forge test --match-contract MUSDirectDebitForkTest \
  --fork-url https://rpc.test.mezo.org --fork-block-number 12923917

# Keeper
cd ../keeper && pnpm install && pnpm test

# Live read-only check
scripts/verify-testnet.sh

# Live Trove distribution (validation experiment 1)
pnpm trove-distribution

# SDK
cd ../sdk && pnpm install && pnpm build

# Frontend (uses the SDK via local link)
cd ../frontend && pnpm install && pnpm dev   # http://localhost:3000
                                              # http://localhost:3000/demo-gym
```

## Mezo dependencies (testnet, verified live 2026-05-10)

| Primitive    | Address                                      | Methods we call                                  |
| ------------ | -------------------------------------------- | ------------------------------------------------ |
| MUSD         | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | `transferFrom`, `balanceOf`, `approve`, `allowance` |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | `getCurrentICR`, `checkRecoveryMode`, `getTroveOwnersCount`, `TroveOwners` |
| PriceFeed    | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | `fetchPrice`                                     |

## End-to-end against real testnet

```sh
PAYER_PRIVATE_KEY=0x…  KEEPER_PRIVATE_KEY=0x…  FEE_RECIPIENT=0x…  PAYEE=0x…  \
  keeper/scripts/deploy-and-tick.sh
```

Deploys `MUSDirectDebit`, creates a schedule from the payer, runs one keeper
tick, asserts a real MUSD payment landed — or reports the CR gate refused
execution (also a valid pass state — the product working as designed).

## What ships in the demo

| URL | What |
|---|---|
| `/` | Landing page (problem / solution / how-it-works / contracts) + Dashboard (Trove health + safe headroom + Create schedule + Schedules list) |
| `/demo-gym` | Fake gym dApp using `@musdirect/sdk` — recurring subscriptions in 6 lines |
| `/demo-api` | Fake AI inference endpoint using `@musdirect/x402` — pay-per-call APIs in 6 lines, CR-gate refuses when Trove is unsafe |
| `/api/premium` | The actual server route behind the demo, gated by `createX402Middleware`. Returns `402 Payment Required` until paid; on receipt verification returns a JSON answer. |

## Open items per PRD §15

1. ~~`checkRecoveryMode` location~~ → resolved (TroveManager).
2. ~~Passport approve + transferFrom flow~~ → wired in code; pending the on-chain
   end-to-end run.
3. ~~Mezo Earn gauge registration~~ → superseded by the pre-funded MEZO treasury
   path. Gauge can fund the treasury later without redeploying.
4. EIP-2612 `permit` on MUSD — would unlock P1-C as a one-day bolt-on.
