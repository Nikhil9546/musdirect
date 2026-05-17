"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_LINKS = [
  { label: "Problem", href: "/#problem" },
  { label: "Solution", href: "/#solution" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Demo", href: "/demo" },
  { label: "API demo", href: "/demo-api" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-[#1a1a1a] bg-white/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6">
        {/* Top Row: Logo + Wallet (always visible) */}
        <div className="flex h-14 items-center justify-between gap-2 sm:gap-4">
          {/* Logo */}
          <a href="/" className="flex shrink-0 items-baseline gap-1 sm:gap-2">
            <span className="text-sm font-extrabold tracking-tight text-mezo-ink sm:text-lg md:text-xl">
              <span className="text-mezo-orange">MUS</span>Direct
            </span>
            <span className="rounded-full border border-mezo-ink px-1 py-0.5 text-[7px] font-bold uppercase tracking-widest text-mezo-ink sm:border-2 sm:px-2 sm:text-[10px]">
              Debit
            </span>
          </a>

          {/* Nav links (Desktop Only - Center) */}
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
          <div className="flex shrink-0 items-center">
            <ConnectButton
              label="Connect"
              accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
              chainStatus="icon"
            />
          </div>
        </div>

        {/* Bottom Row: Mobile Nav (Mobile Only) */}
        <nav className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#1a1a1a]/5 pb-2 pt-2 md:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[10px] font-bold uppercase tracking-wider text-mezo-mute transition-colors hover:text-mezo-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
