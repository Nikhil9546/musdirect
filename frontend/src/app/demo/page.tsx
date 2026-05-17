"use client";

import { SubscribeButton } from "@musdirect/sdk";
import { Header } from "@/components/Header";
import { ENV } from "@/lib/env";

// Demo "Mezo Demo" dApp — shows how a third-party app embeds MUSDirect Debit's
// SubscribeButton in six lines. Per PRD §5 differentiator #4: "Drop-in dApp
// SDK. Third-party Mezo apps embed <MUSDirectDebit.SubscribeButton /> in 6
// lines. Positions the scheduler as Mezo's recurring-payments primitive."

const GYM_PAYEE_PLACEHOLDER = "0x000000000000000000000000000000000000DEAD" as `0x${string}`;

interface Plan {
  name: string;
  price: number;
  blurb: string;
  bullets: string[];
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    name: "Bench",
    price: 19,
    blurb: "Off-peak gym access. Squat rack only.",
    bullets: ["Weekday mornings only", "Standard lockers", "Email support"],
  },
  {
    name: "Iron",
    price: 49,
    blurb: "Anytime access. Includes one PT session per month.",
    bullets: ["24/7 access", "1× PT session/mo", "Sauna + steam"],
    highlight: true,
  },
  {
    name: "Apex",
    price: 99,
    blurb: "Everything Iron + weekly PT, priority booking, towel service.",
    bullets: ["Weekly PT", "Priority class booking", "Towel service"],
  },
];

export default function MezoGymDemo() {
  const schedulerConfigured = ENV.scheduler !== null;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      <main className="mx-auto max-w-4xl flex-grow px-4 py-16 md:px-6">
        <section className="mb-12 text-center">
          <span className="btn-accent mb-6 inline-flex text-xs">
            Powered by @musdirect/sdk
          </span>
          <h1 className="text-balance text-xl font-extrabold leading-tight tracking-tight text-mezo-ink sm:text-4xl md:text-5xl">
            Membership that pauses when your Trove is at risk.
          </h1>
          <p className="mx-auto mt-4 max-w-prose text-balance text-sm text-mezo-mute sm:text-base">
            Pay monthly in MUSD. If your collateral ratio gets dangerous, this
            month&apos;s payment quietly skips itself — your membership
            re-enables when your Trove is healthy again.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`card card-hover flex flex-col ${
                plan.highlight ? "border-mezo-orange" : ""
              }`}
            >
              {plan.highlight && (
                <span className="mb-2 inline-block self-start rounded-full border-2 border-mezo-orange bg-mezo-orange px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  Most chosen
                </span>
              )}
              <h2 className="text-2xl font-extrabold text-mezo-ink">{plan.name}</h2>
              <p className="mt-1 text-sm text-mezo-mute">{plan.blurb}</p>
              <p className="mt-4 font-mono text-4xl font-extrabold text-mezo-ink">
                {plan.price} <span className="text-base text-mezo-mute">MUSD/mo</span>
              </p>
              <ul className="mt-4 mb-6 space-y-1.5 text-sm text-mezo-mute">
                {plan.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="text-mezo-orange">▸</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {schedulerConfigured ? (
                  <SubscribeButton
                    schedulerAddress={ENV.scheduler!}
                    payee={GYM_PAYEE_PLACEHOLDER}
                    amount={BigInt(plan.price) * 10n ** 18n}
                    frequency={30n * 86_400n}
                    totalSpentCap={BigInt(plan.price) * 12n * 10n ** 18n}
                    minSafeCR={1_500000000000000000n}
                    label={`Subscribe to ${plan.name}`}
                    className="btn-primary w-full justify-center"
                  />
                ) : (
                  <button
                    disabled
                    className="btn-primary w-full justify-center opacity-50"
                  >
                    Scheduler not deployed
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-16 rounded-2xl border-2 border-[#1a1a1a] bg-[#1a1a1a] p-6 font-mono text-sm text-gray-200">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-mezo-orange">
            Integration — 6 lines
          </p>
          <pre className="max-w-full overflow-x-auto text-xs leading-relaxed">{`import { SubscribeButton } from "@musdirect/sdk";

<SubscribeButton
  schedulerAddress="0x…"
  payee="0xYourRevenue"
  amount={49n * 10n ** 18n}
  frequency={30n * 86400n}
  totalSpentCap={49n * 12n * 10n ** 18n}
  minSafeCR={2_500000000000000000n}
/>`}</pre>
        </section>
      </main>

      <footer className="border-t-2 border-[#1a1a1a] bg-white/60 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-sm text-mezo-mute md:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold tracking-tight text-mezo-ink">
              <span className="text-mezo-orange">MUS</span>Direct
            </span>
            <span className="text-xs font-bold">Debit</span>
          </div>
          <p>
            Mezo testnet &middot; chain id {ENV.chainId} &middot; Collateral-aware
            recurring payments
          </p>
        </div>
      </footer>
    </div>
  );
}
