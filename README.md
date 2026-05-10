# MUSDirect Debit

Collateral-aware recurring MUSD payments on Mezo. Auto-pay rent / SaaS / payroll
without risking your Bitcoin — every scheduled execution reads the payer's Trove
ICR first and refuses payments that would push them toward liquidation.

Hackathon: **Mezo Hackathon: Building Bitcoin's Future** — MUSD Track.
PRD: see `../output/PRD-2026-05-01.md` (and the v2-corrected PDF).

## Repo layout

```
musdirect/
├── contracts/          Foundry project — MUSDirectDebit.sol + tests
├── keeper/             Node + viem cron service (scaffold pending)
├── frontend/           Next.js + wagmi + Mezo Passport (scaffold pending)
└── sdk/                @musdirect/sdk — dApp embed package (P1, scaffold pending)
```

## Status

### Done
- [x] Foundry project, OpenZeppelin, Mezo dependency interfaces (verified against live testnet)
- [x] **`MUSDirectDebit.sol`** — schedule lifecycle, CR-gated execution, Recovery
      Mode floor (155%), per-schedule allowance accounting, 3-failure auto-cancel,
      reentrancy guard, fee accounting (25 bps capped at 5 MUSD)
- [x] **Day-2 ABI verification** — `BorrowerOperations.checkRecoveryMode` does not
      exist; the function lives on `TroveManager` in Mezo's Liquity-fork. Interface,
      contract, and deploy script all corrected.
- [x] **All mocks deleted** — no `MockMUSD`, `MockTroveManager`, etc. in the repo
- [x] **14/14 fork tests pass** (`MUSDirectDebit.fork.t.sol`) against the real Mezo
      testnet at the four verified addresses. Edge cases (specific CR levels, RM
      on/off) use Foundry's `vm.mockCall` cheat code to override individual return
      values on real contracts — no deployed mock contracts.
- [x] **Live verification harness** — `keeper/scripts/verify-testnet.sh` calls every
      function MUSDirectDebit depends on against `rpc.test.mezo.org` and prints
      schema-match results (PASS as of last run; supply ≈ 1.37B MUSD, BTC ≈ $80.2K)
- [x] **`@musdirect/keeper`** — TypeScript + viem + node-cron service. Discovers
      schedules via `ScheduleCreated` events, polls due schedules, calls
      `executePayment` with revert classification.
- [x] **15/15 keeper unit tests** (vitest)
- [x] **Foundry deploy script** — `Deploy.s.sol` targets real testnet/mainnet
      (env-driven addresses; no local-mock variant)

### Next
- [x] **Frontend connect flow** — Next.js 14 + wagmi v2 + Mezo Passport (Bitcoin
      + EVM wallets via OrangeKit/RainbowKit). Trove health card reads live
      ICR / Recovery Mode / MUSD balance / BTC price from real testnet contracts.
      Production build clean (296 KB First Load JS). See `frontend/README.md`.
- [ ] Validation experiment 1: pull mainnet `TroveManager` events; chart CR distribution; pick a sensible default `minSafeCR` for the UI
- [ ] Deploy `MUSDirectDebit` to Mezo testnet with a funded wallet
- [ ] Open a real Trove for a test payer; create a real schedule; run keeper end-to-end on live testnet
- [ ] Frontend Week 4: "Set up payment" form + schedule list + "safe headroom" widget
- [ ] dApp SDK + integration partner — P1-A, the moat (Week 5 per PRD §14)

## Build & test

```sh
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-git --shallow  # one-time, since lib/ is gitignored

# Fork tests against real Mezo testnet (chain id 31611):
forge test --match-contract MUSDirectDebitForkTest \
  --fork-url https://rpc.test.mezo.org --fork-block-number 12923917

# Live read-only verification (no funds needed):
../keeper/scripts/verify-testnet.sh
```

## Mezo dependencies (testnet, verified live 2026-05-04)

| Primitive    | Address                                      | Methods we call                                |
| ------------ | -------------------------------------------- | ---------------------------------------------- |
| MUSD         | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | `transferFrom`, `balanceOf`, `approve`         |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | `getCurrentICR`, `checkRecoveryMode`           |
| PriceFeed    | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | `fetchPrice`                                   |

## Test suite (fork tests, real testnet)

```
PASS test_fork_realInterfacesAreCallable           // schema check against real ABIs
PASS test_fork_executePayment_happyPath            // 99.75 MUSD lands at payee, 0.25 fee
PASS test_fork_pausesWhenBelowCR
PASS test_fork_threeFailures_autoCancels
PASS test_fork_recoveryMode_elevatesFloorTo155
PASS test_fork_recoveryMode_doesNotLowerHigherUserFloor
PASS test_fork_cap_autoCancelsWhenExceeded
PASS test_fork_expired_autoCancels
PASS test_fork_cadence_cannotExecuteEarly
PASS test_fork_cancel_blocksExecution
PASS test_fork_pauseResume_resetsFailureCount
PASS test_fork_feeCappedAt5MUSD
PASS test_fork_create_validation
PASS test_fork_priceFeed_documentedNote            // see comment in test
```

## Open Day-1 verification (per PRD §15)

1. ~~Confirm `BorrowerOperations.checkRecoveryMode` exists~~ → resolved 2026-05-04;
   the function lives on `TroveManager`. Interface and contract corrected.
2. Confirm `mezo-org/orangekit-smart-account` permits the standard ERC-20 approve +
   third-party `transferFrom` flow on Mezo testnet (test in frontend phase).
3. Read the Mezo Earn whitepaper / gauge contract source — confirm gauge registration
   is open or has a documented application path. If permissioned, the documented
   fallback is to pay keeper rewards in MEZO from a small pre-funded treasury.
4. Confirm whether MUSD supports EIP-2612 `permit` (would unlock P1-C as a one-day
   bolt-on).
