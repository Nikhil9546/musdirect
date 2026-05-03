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

## Status — Day 1

- [x] Foundry project initialised, OpenZeppelin installed
- [x] Mezo dependency interfaces (`ITroveManager`, `IBorrowerOperations`, `IPriceFeed`)
- [x] **`MUSDirectDebit.sol` v0** — schedule lifecycle, CR-gated execution, Recovery
      Mode floor (155%), per-schedule allowance accounting, 3-failure auto-cancel,
      reentrancy guard, fee accounting (25 bps capped at 5 MUSD)
- [x] **16/16 unit tests passing** (mocked Mezo deps)
- [ ] Day 2: fork tests against `rpc.test.mezo.org` to confirm real interfaces match
- [ ] Day 2: validation experiment 1 (on-chain Trove distribution analysis)
- [ ] Days 3–5: keeper spike, frontend connect flow, validation experiments 2 + 3

## Build & test

```sh
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-git --shallow  # one-time, since lib/ is gitignored
forge test                 # unit tests with mocks (no network)
forge test --gas-report    # gas profile per function
FOUNDRY_PROFILE=fork forge test --match-contract Fork  # day 2: forked Mezo testnet
```

## Mezo dependencies (testnet)

| Primitive          | Address                                      |
| ------------------ | -------------------------------------------- |
| MUSD               | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| TroveManager       | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| BorrowerOperations | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| PriceFeed          | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` |

## Test suite (current)

```
PASS test_create_validation
PASS test_executePayment_happyPath
PASS test_executePayment_pausesWhenBelowCR
PASS test_executePayment_threeFailures_autoCancels
PASS test_recoveryMode_elevatesFloor
PASS test_recoveryMode_doesNotLowerHighUserFloor
PASS test_cap_autoCancelsWhenExceeded
PASS test_expired_autoCancels
PASS test_cadence_cannotExecuteEarly
PASS test_cadence_lateExecutionStaysOnSchedule
PASS test_cancel_blocksExecution
PASS test_cancel_onlyPayer
PASS test_pauseResume_resetsFailureCount
PASS test_isDue_truthTable
PASS test_feeCappedAt5MUSD
PASS test_successResetsFailureCount
```

## Open Day-1 verification (per PRD §15)

1. Confirm `mezo-org/orangekit-smart-account` permits the standard ERC-20 approve +
   third-party `transferFrom` flow on Mezo testnet.
2. Read the Mezo Earn whitepaper / gauge contract source — confirm gauge registration
   is open or has a documented application path. If permissioned, the documented
   fallback is to pay keeper rewards in MEZO from a small pre-funded treasury.
3. Confirm whether MUSD supports EIP-2612 `permit` (would unlock P1-C as a one-day
   bolt-on).
