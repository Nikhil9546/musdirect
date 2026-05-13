"use client";

import { useAccount, useBalance } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import { Header } from "@/components/Header";
import { WalrusMascot } from "@/components/WalrusMascot";
import { SchedulerStatusCard } from "@/components/SchedulerStatusCard";
import { TroveHealthCard } from "@/components/TroveHealthCard";
import { ENV } from "@/lib/env";
import { fmtAddress, fmtToken } from "@/lib/format";

export default function HomePage() {
  const { address, isConnected, chain } = useAccount();
  const balance = useBalance({ address });

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden px-6 py-24 md:py-32 lg:py-40">
        <div className="mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2">
          <div className="animate-fade-up">
            <span className="btn-accent mb-6 inline-flex text-xs">
              Built on Mezo
            </span>

            <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight text-mezo-ink md:text-6xl lg:text-7xl">
              Auto-pay your
              <br />
              rent in MUSD{" "}
              <span className="text-mezo-orange">
                without risking your&nbsp;Bitcoin.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-mezo-mute md:text-xl">
              Programmable recurring payments with collateral-aware safeguards.
              Your Trove stays safe&nbsp;&mdash;&nbsp;automatically.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <ConnectButton label="Launch App" />
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
      <section id="problem" className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <span className="btn-primary mb-6 inline-flex text-xs">
            The Problem
          </span>
          <h2 className="max-w-3xl text-4xl font-extrabold tracking-tight text-mezo-ink md:text-5xl">
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
      <section id="solution" className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <span className="btn-accent mb-6 inline-flex text-xs">
            The Solution
          </span>
          <h2 className="max-w-3xl text-4xl font-extrabold tracking-tight text-mezo-ink md:text-5xl">
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
              title="Fully On-Chain"
              description="Trustless, transparent, permissionless"
            />
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <span className="btn-primary mb-6 inline-flex text-xs">
            How It Works
          </span>
          <h2 className="text-4xl font-extrabold tracking-tight text-mezo-ink md:text-5xl">
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
      <section id="contracts" className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <span className="btn-secondary mb-6 inline-flex text-xs">
            Contracts
          </span>
          <h2 className="text-4xl font-extrabold tracking-tight text-mezo-ink md:text-5xl">
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

      {/* ─── DASHBOARD ─── */}
      <section id="dashboard" className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <span className="btn-accent mb-6 inline-flex text-xs">
            Dashboard
          </span>
          <h2 className="text-4xl font-extrabold tracking-tight text-mezo-ink md:text-5xl">
            Your Trove at a glance.
          </h2>

          {!isConnected && (
            <div className="card card-hover mt-12 border-dashed text-center">
              <p className="mb-2 text-2xl font-extrabold text-mezo-ink">
                Connect your wallet to get started
              </p>
              <p className="mx-auto mb-8 max-w-md text-mezo-mute">
                Mezo Passport supports Bitcoin wallets (Unisat, OKX, Xverse)
                and EVM wallets (MetaMask, WalletConnect).
              </p>
              <div className="inline-block">
                <ConnectButton label="Connect Wallet" />
              </div>
            </div>
          )}

          {isConnected && address && (
            <>
              <div className="card mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span>
                  <span className="font-semibold text-mezo-mute">Wallet </span>
                  <span className="font-mono font-bold">
                    {fmtAddress(address)}
                  </span>
                </span>
                <span>
                  <span className="font-semibold text-mezo-mute">Chain </span>
                  <span className="font-mono">
                    {chain?.name ?? "\u2014"} ({chain?.id ?? ENV.chainId})
                  </span>
                </span>
                <span>
                  <span className="font-semibold text-mezo-mute">Native </span>
                  <span className="font-mono">
                    {fmtToken(balance.data?.value)}{" "}
                    {balance.data?.symbol ?? "BTC"}
                  </span>
                </span>
              </div>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <TroveHealthCard account={address} />
                <SchedulerStatusCard />
              </div>
            </>
          )}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t-2 border-[#1a1a1a] bg-white/60 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 text-sm text-mezo-mute">
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
