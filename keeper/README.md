# @musdirect/keeper

Cron service that executes due MUSDirect Debit schedules. Polls the scheduler
every minute, picks up `ScheduleCreated` events, calls `executePayment` for
each schedule that's currently due.

## Run locally

```sh
pnpm install
cp .env.example .env  # then edit values
pnpm dev              # watch mode via tsx
```

Or build + run as a service:

```sh
pnpm build
pnpm start
```

## End-to-end test (real EVM, no mocks for the contract path)

```sh
scripts/e2e.sh
```

Spins up anvil, deploys `MUSDirectDebit` + mock dependencies, funds an account,
creates a schedule, runs one keeper tick, asserts that 99.75 MUSD landed at the
payee and 0.25 MUSD at the fee recipient. **Run from any directory.**

## Unit tests

```sh
pnpm test
```

Covers `shouldAttempt` decision logic, revert classification (TooEarly retryable
vs ScheduleNotActive fatal), tick discovery + de-duplication, `maxPerTick`, and
the no-rescan-without-new-blocks invariant.

## Architecture

```
src/
├── abi.ts          MUSDirectDebit ABI subset (events + executePayment + custom errors)
├── config.ts       env loader with validation
├── log.ts          minimal level-filtered logger
├── scheduler.ts    viem wrappers (PublicClient + WalletClient + readContract helpers)
├── keeper.ts       tick(), classifyRevert(), KeeperState
├── index.ts        cron entry point — registers the tick on a schedule
└── cli/
    └── tick.ts     one-shot tick for ad-hoc debugging and the e2e harness
```

State is in-memory: `KeeperState` tracks `lastScannedBlock`, `knownIds`, and
`fatalIds`. On restart, the keeper rescans from `START_BLOCK` env. For mainnet
operation, `START_BLOCK` should match the deployment block of `MUSDirectDebit`.

## Revert classification

| Revert | Outcome | Reasoning |
|---|---|---|
| `TooEarly` | retryable | Race between snapshot read and write — try next tick. |
| `ScheduleNotActive` | **fatal** (per id) | User cancelled / paused / auto-cancelled. Skip this id forever. |
| `UnknownSchedule` | **fatal** | Stale event data; this id should never have entered the candidate set. |
| Anything else (RPC error, unknown revert) | retryable | Default to retry; conservative. |

## Cost per tick (Mezo gas)

`executePayment` happy path: ~127K gas. Mezo gas is sub-cent — keeping a 60s
cron tick running across hundreds of schedules costs ~$0.04 per execution by
the contract's own model, well below the 0.25%/$5-capped fee.
