"use client";

import { useAccount, useBalance } from "wagmi";

import { Header } from "@/components/Header";
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <section className="mb-10">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Auto-pay your rent in MUSD
            <br />
            <span className="text-mezo-orange">without risking your Bitcoin.</span>
          </h1>
          <p className="max-w-2xl text-mezo-mute">
            MUSDirect Debit is a programmable recurring-payment rail for MUSD
            with collateral-aware safeguards. Every scheduled payment reads
            your Trove&apos;s collateral ratio first and refuses to execute if
            it would push you toward liquidation.
          </p>
        </section>

        {!isConnected && (
          <div className="rounded-lg border border-mezo-edge bg-mezo-surface p-8 text-center">
            <p className="mb-4 text-lg">Connect a wallet to see your Trove.</p>
            <p className="text-sm text-mezo-mute">
              Mezo Passport supports Bitcoin wallets (Unisat, OKX, Xverse) and
              EVM wallets (MetaMask, WalletConnect). Use the Connect button in
              the header.
            </p>
          </div>
        )}

        {isConnected && address && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-mezo-edge bg-mezo-surface px-6 py-4 text-sm">
              <span>
                <span className="text-mezo-mute">Wallet </span>
                <span className="font-mono">{fmtAddress(address)}</span>
              </span>
              <span>
                <span className="text-mezo-mute">Chain </span>
                <span className="font-mono">
                  {chain?.name ?? "—"} ({chain?.id ?? ENV.chainId})
                </span>
              </span>
              <span>
                <span className="text-mezo-mute">Native </span>
                <span className="font-mono">
                  {fmtToken(balance.data?.value)} {balance.data?.symbol ?? "BTC"}
                </span>
              </span>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <TroveHealthCard account={address} />
              <SchedulerStatusCard />
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-mezo-edge bg-mezo-ink/80 py-6 text-center text-xs text-mezo-mute">
        Mezo testnet · chain id {ENV.chainId} · MUSDirect Debit P0
      </footer>
    </div>
  );
}
