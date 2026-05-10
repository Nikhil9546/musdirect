"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Header() {
  return (
    <header className="border-b border-mezo-edge bg-mezo-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold tracking-tight">MUSDirect</span>
          <span className="text-xs text-mezo-mute">Debit</span>
        </div>
        <ConnectButton
          accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
          chainStatus="icon"
        />
      </div>
    </header>
  );
}
