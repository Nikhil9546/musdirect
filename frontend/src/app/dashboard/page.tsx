"use client";

import { useAccount, useBalance, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import { Header } from "@/components/Header";
import { SchedulerStatusCard } from "@/components/SchedulerStatusCard";
import { TroveHealthCard } from "@/components/TroveHealthCard";
import { CreateScheduleForm } from "@/components/CreateScheduleForm";
import { SchedulesList } from "@/components/SchedulesList";
import { ENV } from "@/lib/env";
import { fmtAddress, fmtToken } from "@/lib/format";

export default function DashboardPage() {
  const { address, isConnected, chain } = useAccount();
  const balance = useBalance({ address });
  const chainId = useChainId();

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      <main className="flex-grow px-4 pb-12 pt-24 md:px-6 md:pt-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div>
              <span className="btn-accent mb-4 inline-flex text-xs">
                Dashboard
              </span>
              <h1 className="text-balance text-2xl font-extrabold leading-tight tracking-tight text-mezo-ink sm:text-4xl md:text-5xl">
                Your Trove at a glance.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-mezo-mute sm:text-lg">
                Monitor your health, manage your recurring payments, and protect
                your Bitcoin collateral automatically.
              </p>
            </div>

            {!isConnected && (
              <div className="animate-bounce">
                <ConnectButton label="Connect Wallet" />
              </div>
            )}
          </div>

          {!isConnected ? (
            <div className="card card-hover border-dashed py-20 text-center">
              <p className="mb-2 text-xl font-extrabold text-mezo-ink sm:text-2xl">
                Connect your wallet to view your dashboard
              </p>
              <p className="mx-auto mb-8 max-w-md text-sm text-mezo-mute sm:text-base">
                Mezo Passport supports Bitcoin wallets (Unisat, OKX, Xverse)
                and EVM wallets (MetaMask, WalletConnect).
              </p>
              <div className="inline-block">
                <ConnectButton label="Connect Wallet" />
              </div>
            </div>
          ) : (
            <>
              {/* Wallet Info Bar */}
              <div className="card mb-8 flex flex-wrap items-center gap-x-8 gap-y-4 py-4 text-sm">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-mezo-mute uppercase tracking-wider text-[10px]">Wallet</span>
                  <span className="font-mono font-bold text-mezo-ink">
                    {address ? fmtAddress(address) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-mezo-mute uppercase tracking-wider text-[10px]">Network</span>
                  <span className="font-mono font-bold text-mezo-ink">
                    {chain?.name ?? "Mezo Testnet"} ({chainId})
                  </span>
                </div>
                <div className="flex items-center gap-3 sm:ml-auto">
                  <span className="font-semibold text-mezo-mute uppercase tracking-wider text-[10px]">MUSD Balance</span>
                  <span className="font-mono font-bold text-mezo-orange">
                    {fmtToken(balance.data?.value)} {balance.data?.symbol ?? "BTC"}
                  </span>
                </div>
              </div>

              {/* Grid: Health + Status */}
              <div className="grid gap-6 sm:grid-cols-2">
                <TroveHealthCard account={address!} />
                <SchedulerStatusCard />
              </div>

              {/* Grid: Create + List */}
              <div className="mt-8 grid gap-8 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <CreateScheduleForm />
                </div>
                <div className="lg:col-span-3">
                  <SchedulesList />
                </div>
              </div>
            </>
          )}
        </div>
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
