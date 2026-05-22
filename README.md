# MUSDirect Debit

Collateral-aware MUSD payments on Mezo.

MUSDirect lets borrowers automate recurring payments and one-shot API payments
without ignoring their Bitcoin collateral health. Before a payment executes, the
contract checks the payer's Trove collateral ratio and refuses the payment if it
would run below the configured safety floor.

## What It Does

- **Recurring MUSD payments** for rent, subscriptions, payroll, and SaaS.
- **x402-style one-shot payments** for paid APIs and agent workflows.
- **Collateral-aware execution** using Mezo Trove ICR checks.
- **Recovery Mode protection** with a 155% minimum floor when Recovery Mode is active.
- **3-failure auto-cancel** for schedules that repeatedly fail the CR gate.
- **Optional MEZO keeper rewards** from a pre-funded treasury.

## Contracts

| Contract | Link |
| --- | --- |
| MUSDirectDebit source | [`contracts/src/MUSDirectDebit.sol`](contracts/src/MUSDirectDebit.sol) |
| Deploy script | [`contracts/script/Deploy.s.sol`](contracts/script/Deploy.s.sol) |
| Fork tests | [`contracts/test/MUSDirectDebit.fork.t.sol`](contracts/test/MUSDirectDebit.fork.t.sol) |
| TroveManager interface | [`contracts/src/interfaces/ITroveManager.sol`](contracts/src/interfaces/ITroveManager.sol) |
| PriceFeed interface | [`contracts/src/interfaces/IPriceFeed.sol`](contracts/src/interfaces/IPriceFeed.sol) |

### Mezo Testnet Deployment

| Component | Address |
| --- | --- |
| MUSDirectDebit | [`0x47e0e0ef8936175ee769e857740f463a9e6f6a9e`](https://explorer.test.mezo.org/address/0x47e0e0ef8936175ee769e857740f463a9e6f6a9e) |
| MUSD | [`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`](https://explorer.test.mezo.org/address/0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503) |
| TroveManager | [`0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0`](https://explorer.test.mezo.org/address/0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0) |
| PriceFeed | [`0x86bCF0841622a5dAC14A313a15f96A95421b9366`](https://explorer.test.mezo.org/address/0x86bCF0841622a5dAC14A313a15f96A95421b9366) |

Network: Mezo testnet, chain id `31611`.

## Repository Layout

```text
musdirect/
├── contracts/   Foundry smart contracts and fork tests
├── keeper/      viem cron keeper for due schedule execution
├── frontend/    Next.js app, dashboard, and demos
├── sdk/         @musdirect/sdk SubscribeButton for recurring payments
└── sdk-x402/    @musdirect/x402 middleware, client, and verifier
```

## How Payments Work

### Recurring Payments

1. A user approves MUSD for the scheduler.
2. A schedule is created with payee, amount, frequency, expiry, cap, and minimum CR.
3. The keeper calls `executePayment(scheduleId)` when the schedule is due.
4. The contract checks the payer's current ICR through Mezo's TroveManager.
5. If safe, MUSD transfers to the payee and the next execution time advances.
6. If unsafe, the payment is skipped and the failure count increments.

### x402 One-Shot Payments

1. A protected API returns `402 Payment Required` with payment details.
2. The client signs an on-chain `executeOneShot(...)` payment.
3. The API verifies the `OneShotPaid` event from the transaction receipt.
4. If valid, the server returns the premium response.

Both flows use the same CR gate, Recovery Mode floor, fee logic, and replay
protection model.

## Demo Routes

Run the frontend and open:

| Route | Description |
| --- | --- |
| `/` | Product overview and entry point |
| `/dashboard` | Trove health, schedule creation, and schedule list |
| `/demo-gym` | Example dApp using `@musdirect/sdk` for subscriptions |
| `/demo-api` | x402 paid API demo |
| `/api/premium` | Protected API route that returns `402` until paid |

## Running Locally

Install dependencies per package:

```sh
cd frontend && pnpm install
cd ../keeper && pnpm install
cd ../sdk && pnpm install
cd ../sdk-x402 && pnpm install
```

Start the frontend:

```sh
cd frontend
pnpm dev
```

Frontend URL: `http://localhost:3000`

Start the keeper:

```sh
cd keeper
pnpm dev
```

The keeper reads `keeper/.env` and executes due schedules for the configured
`SCHEDULER_ADDRESS`.

## Testing

Contracts:

```sh
cd contracts
forge test --match-contract MUSDirectDebitForkTest \
  --fork-url https://rpc.test.mezo.org \
  --fork-block-number 12923917
```

Keeper:

```sh
cd keeper
pnpm test
```

SDK:

```sh
cd sdk
pnpm build
```

x402:

```sh
cd sdk-x402
pnpm test
```

## Environment

Frontend public env:

```sh
NEXT_PUBLIC_RPC_URL=https://rpc.test.mezo.org
NEXT_PUBLIC_CHAIN_ID=31611
NEXT_PUBLIC_SCHEDULER_ADDRESS=0x47e0e0ef8936175ee769e857740f463a9e6f6a9e
NEXT_PUBLIC_MUSD_ADDRESS=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
NEXT_PUBLIC_TROVE_MANAGER_ADDRESS=0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0
NEXT_PUBLIC_PRICE_FEED_ADDRESS=0x86bCF0841622a5dAC14A313a15f96A95421b9366
```

Keeper env:

```sh
RPC_URL=https://rpc.test.mezo.org
CHAIN_ID=31611
SCHEDULER_ADDRESS=0x47e0e0ef8936175ee769e857740f463a9e6f6a9e
KEEPER_PRIVATE_KEY=0x...
```

Never commit funded private keys.

## Notes

- Auto-cancelled schedules cannot be resumed. Create a new schedule after
  restoring Trove health or lowering the minimum CR.
- A landed keeper transaction can still represent a skipped payment if the CR
  gate refused execution. The contract records this through `PaymentPaused`.
- For a successful testnet demo, the payer needs testBTC for gas, MUSD balance,
  MUSD allowance, and a Trove whose ICR is above the schedule threshold.
