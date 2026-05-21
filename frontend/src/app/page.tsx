"use client";

import { Header } from "@/components/Header";
import { WalrusMascot } from "@/components/WalrusMascot";
import { ENV } from "@/lib/env";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden px-4 pb-24 pt-32 md:px-6 md:py-32 lg:py-40">
        <div className="mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2">
          <div className="animate-fade-up">
            <span className="btn-accent mb-6 inline-flex text-xs">
              Built on Mezo
            </span>

            <h1 className="text-balance text-2xl font-extrabold leading-[1.1] tracking-tight text-mezo-ink sm:text-4xl md:text-6xl lg:text-7xl">
              Auto-pay your rent in MUSD{" "}
              <span className="text-mezo-orange">
                without risking your Bitcoin.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-mezo-mute sm:text-lg md:text-xl">
              Programmable recurring payments with collateral-aware safeguards.
              Your Trove stays safe &mdash; automatically.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a href="/dashboard" className="btn-primary">
                Launch App
              </a>
              <a href="#how-it-works" className="btn-secondary group">
                How It Works{" "}
                <span className="inline-block transition-transform group-hover:translate-x-1">
                  &rarr;
                </span>
              </a>
            </div>
          </div>

          {/* Walrus + decorative stripes */}
          <div className="relative flex justify-center">
            <div className="hero-stripes absolute inset-y-0 -inset-x-8 rounded-3xl" />
            <WalrusMascot className="relative z-10 w-56 animate-float md:w-72 lg:w-80" />
          </div>
        </div>
      </section>

      {/* ─── PROBLEM ─── */}
      <section id="problem" className="px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-7xl">
          <span className="btn-primary mb-6 inline-flex text-xs">
            The Problem
          </span>
          <h2 className="text-balance max-w-3xl text-3xl font-extrabold tracking-tight text-mezo-ink sm:text-4xl md:text-5xl">
            MUSD borrowers have no safe way to automate payments.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-mezo-mute">
            Every missed payment is a risk. Every manual transaction is a chance
            to slip below your collateral ratio.
          </p>

          <div className="stagger mt-14 grid gap-6 md:grid-cols-3">
            <ProblemCard
              number="01"
              title="Manual Payments Are Risky"
              description="Every month you manually approve MUSD transfers. One bad timing decision — when your CR is low — and you're one step closer to liquidation."
            />
            <ProblemCard
              number="02"
              title="No Payment Automation"
              description="DeFi gives you a Trove, but no way to automate payments from it. You're stuck watching prices and manually executing transactions."
            />
            <ProblemCard
              number="03"
              title="Liquidation Is Unforgiving"
              description="Drop below the minimum collateral ratio and your Bitcoin gets liquidated. No grace period, no warning — just gone."
            />
          </div>
        </div>
      </section>

      {/* ─── SOLUTION ─── */}
      <section id="solution" className="px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-7xl">
          <span className="btn-accent mb-6 inline-flex text-xs">
            The Solution
          </span>
          <h2 className="text-balance max-w-3xl text-3xl font-extrabold tracking-tight text-mezo-ink sm:text-4xl md:text-5xl">
            Set it and forget it.{" "}
            <span className="text-mezo-mute">
              MUSDirect checks your Trove before every payment.
            </span>
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-mezo-mute">
            If executing a payment would push you toward liquidation, it simply
            doesn&apos;t go through. Your Bitcoin stays safe.
          </p>

          <div className="stagger mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              title="Collateral-Aware"
              description="Every payment reads your CR first"
              accent
            />
            <FeatureCard
              title="Auto Scheduling"
              description="Set once, pay on time every time"
            />
            <FeatureCard
              title="Liquidation Shield"
              description="Never accidentally trigger liquidation"
              accent
            />
            <FeatureCard
              title="Recurring + Reactive"
              description="Same CR gate for subscriptions and x402 API payments"
            />
          </div>

          {/* ── Unification thesis ── */}
          <div className="stagger mt-16 grid gap-6 md:grid-cols-2">
            <a href="/demo-gym" className="card card-hover group block">
              <span className="mb-3 inline-block rounded-full border-2 border-mezo-orange/40 bg-orange-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-mezo-orange">
                Recurring
              </span>
              <h3 className="text-2xl font-extrabold text-mezo-ink">
                Subscriptions on Mezo
              </h3>
              <p className="mt-2 text-sm text-mezo-mute">
                Rent, gym, SaaS — set the schedule once. The keeper fires every period;
                the CR gate refuses execution if your Trove is unsafe. Try the demo
                dApp built on <code className="code-inline">@musdirect/sdk</code>.
              </p>
              <span className="mt-4 inline-block text-sm font-bold text-mezo-orange">
                See /demo-gym →
              </span>
            </a>
            <a href="/demo-api" className="card card-hover group block">
              <span className="mb-3 inline-block rounded-full border-2 border-mezo-orange/40 bg-orange-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-mezo-orange">
                Reactive
              </span>
              <h3 className="text-2xl font-extrabold text-mezo-ink">
                x402 APIs on Mezo
              </h3>
              <p className="mt-2 text-sm text-mezo-mute">
                HTTP <code className="code-inline">402 Payment Required</code> with
                MUSD settlement, gated by the same Trove CR. AI agents never accidentally
                drain their owner toward liquidation. Try the live demo.
              </p>
              <span className="mt-4 inline-block text-sm font-bold text-mezo-orange">
                See /demo-api →
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-7xl">
          <span className="btn-primary mb-6 inline-flex text-xs">
            How It Works
          </span>
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-mezo-ink sm:text-4xl md:text-5xl">
            Three steps to safe, automated payments.
          </h2>

          <div className="stagger mt-14 grid gap-8 md:grid-cols-3">
            <StepCard
              step={1}
              title="Connect"
              description="Link your Mezo wallet. MUSDirect reads your Trove's collateral ratio in real time."
            />
            <StepCard
              step={2}
              title="Schedule"
              description="Set your recurring MUSD payments — rent, subscriptions, whatever. Define amount, recipient, and frequency."
            />
            <StepCard
              step={3}
              title="Relax"
              description="MUSDirect handles execution with built-in safety checks. Your Bitcoin stays protected."
            />
          </div>
        </div>
      </section>

      {/* ─── CONTRACTS ─── */}
      <section id="contracts" className="px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-7xl">
          <span className="btn-secondary mb-6 inline-flex text-xs">
            Contracts
          </span>
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-mezo-ink sm:text-4xl md:text-5xl">
            Deployed on Mezo Testnet.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-mezo-mute">
            All contracts are verified and open-source. Click any address to
            view on the block explorer.
          </p>

          <div className="stagger mt-14 grid gap-4 sm:grid-cols-2">
            <ContractCard
              name="MUSD Token"
              description="The stablecoin you borrow from your Trove and use for payments."
              address={ENV.musd}
            />
            <ContractCard
              name="Trove Manager"
              description="Manages Troves — reads your collateral ratio and liquidation status."
              address={ENV.troveManager}
            />
            <ContractCard
              name="Price Feed"
              description="On-chain BTC/USD oracle used to calculate collateral ratios."
              address={ENV.priceFeed}
            />
            <ContractCard
              name="MUSDirectDebit"
              description="The scheduler contract — holds your payment schedule and runs the CR gate."
              address={ENV.scheduler}
              highlight
            />
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
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

/* ────────────────────────────────────────────────────────────────── */

function ProblemCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="card card-hover animate-fade-up">
      <span className="mb-3 inline-block font-mono text-3xl font-extrabold text-mezo-orange/40">
        {number}
      </span>
      <h3 className="mb-2 text-xl font-extrabold text-mezo-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-mezo-mute">{description}</p>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  accent,
}: {
  title: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`animate-fade-up rounded-2xl border-2 border-[#1a1a1a] p-6 transition-all duration-200 hover:-translate-y-0.5 ${
        accent
          ? "bg-mezo-orange text-white"
          : "bg-white text-mezo-ink"
      }`}
    >
      <h3 className="mb-1.5 text-lg font-extrabold">{title}</h3>
      <p className={`text-sm leading-relaxed ${accent ? "text-white/80" : "text-mezo-mute"}`}>
        {description}
      </p>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="card card-hover animate-fade-up">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#1a1a1a] bg-mezo-orange text-lg font-extrabold text-white">
        {step}
      </div>
      <h3 className="mb-2 text-xl font-extrabold text-mezo-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-mezo-mute">{description}</p>
    </div>
  );
}

function ContractCard({
  name,
  description,
  address,
  highlight,
}: {
  name: string;
  description: string;
  address: string | null;
  highlight?: boolean;
}) {
  const explorerHref = address
    ? `${ENV.explorerUrl}/address/${address}`
    : undefined;

  return (
    <div
      className={`card card-hover animate-fade-up ${
        highlight ? "border-mezo-orange" : ""
      }`}
    >
      <div className="mb-1 flex items-center gap-3">
        <h3 className="text-lg font-extrabold text-mezo-ink">{name}</h3>
        {highlight && !address && (
          <span className="rounded-full border border-mezo-orange/40 bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase text-mezo-orange">
            Not deployed
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-mezo-mute">{description}</p>
      {address ? (
        <a
          href={explorerHref}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 font-mono text-sm font-bold text-mezo-orange transition-colors hover:text-mezo-orange-dark"
        >
          {address.slice(0, 6)}...{address.slice(-4)}
          <span className="inline-block transition-transform group-hover:translate-x-0.5">
            &nearr;
          </span>
        </a>
      ) : (
        <span className="font-mono text-sm text-mezo-mute">
          Deploy via keeper/scripts/deploy-and-tick.sh
        </span>
      )}
    </div>
  );
}
