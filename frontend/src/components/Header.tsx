"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_LINKS = [
  { label: "Problem", href: "#problem" },
  { label: "Solution", href: "#solution" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Contracts", href: "#contracts" },
  { label: "Dashboard", href: "#dashboard" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-[#1a1a1a] bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <a href="#" className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold tracking-tight text-mezo-ink">
            <span className="text-mezo-orange">MUS</span>Direct
          </span>
          <span className="rounded-full border-2 border-mezo-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-mezo-ink">
            Debit
          </span>
        </a>

        {/* Nav links */}
        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-mezo-mute transition-colors hover:text-mezo-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Wallet */}
        <ConnectButton
          label="Connect"
          accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
          chainStatus="icon"
        />
      </div>
    </header>
  );
}
