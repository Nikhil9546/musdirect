// Display helpers — keep at the lib boundary so components stay focused on layout.

import { formatUnits } from "viem";

export function fmtAddress(addr: string | null | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function fmtToken(value: bigint | undefined, decimals = 18, max = 4): string {
  if (value === undefined) return "—";
  const raw = formatUnits(value, decimals);
  const [intPart, fracPart = ""] = raw.split(".");
  const truncFrac = fracPart.slice(0, max).replace(/0+$/, "");
  return truncFrac ? `${intPart}.${truncFrac}` : (intPart ?? "0");
}

/// Formats a CR like 2.5e18 as "250%". Returns "—" for undefined.
/// Returns "∞" for type(uint256).max (no Trove).
export function fmtCR(icr: bigint | undefined): string {
  if (icr === undefined) return "—";
  if (icr === BigInt(2) ** BigInt(256) - BigInt(1)) return "∞";
  // CR is scaled by 1e18 → multiply by 100, divide by 1e18, render as %.
  const pct = Number((icr * BigInt(10_000)) / BigInt(10n ** 18n)) / 100;
  return `${pct.toFixed(1)}%`;
}

export function fmtUsdPrice(price: bigint | undefined): string {
  if (price === undefined) return "—";
  const dollars = Number(price / BigInt(10n ** 18n));
  return `$${dollars.toLocaleString("en-US")}`;
}

/// Parse a human-typed decimal string (e.g. "100.5") into a bigint scaled by
/// `decimals`. Throws on malformed input. Empty string → 0n.
export function parseTokenAmount(input: string, decimals = 18): bigint {
  const trimmed = input.trim();
  if (trimmed === "") return 0n;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a number: ${input}`);
  }
  const [intPart, fracPart = ""] = trimmed.split(".");
  if (fracPart.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`);
  }
  const padded = fracPart.padEnd(decimals, "0");
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(padded);
}

/// Format a unix timestamp (seconds) as a relative duration from now.
/// "in 2d 4h", "in 12m", "in 30s", "now", or "23s ago".
export function fmtRelative(unixSec: bigint | number | undefined): string {
  if (unixSec === undefined) return "—";
  const target = Number(typeof unixSec === "bigint" ? unixSec : BigInt(unixSec));
  const nowSec = Math.floor(Date.now() / 1000);
  let diff = target - nowSec;
  const past = diff < 0;
  diff = Math.abs(diff);

  let label: string;
  if (diff < 1) label = "now";
  else if (diff < 60) label = `${diff}s`;
  else if (diff < 3600) label = `${Math.floor(diff / 60)}m`;
  else if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    label = m > 0 ? `${h}h ${m}m` : `${h}h`;
  } else {
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    label = h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
  if (label === "now") return "now";
  return past ? `${label} ago` : `in ${label}`;
}

/// Given current ICR and a user's minSafeCR threshold, returns the maximum
/// percentage BTC price could drop before the user's CR hits their threshold.
/// Returns null if user has no Trove (CR = ∞) or already below threshold.
export function safeHeadroomPct(
  currentICR: bigint | undefined,
  minSafeCR: bigint | undefined
): number | null {
  if (currentICR === undefined || minSafeCR === undefined) return null;
  if (currentICR === BigInt(2) ** BigInt(256) - BigInt(1)) return null; // no Trove
  if (currentICR <= minSafeCR) return 0;
  // ICR is proportional to BTC price. If price drops by p%, ICR drops by p% too.
  // We want the largest p such that currentICR * (1 - p) >= minSafeCR.
  // → p_max = 1 - minSafeCR / currentICR.
  // Both values are scaled by 1e18; the ratio is a clean rational.
  const ratio = Number(
    (minSafeCR * BigInt(10_000)) / currentICR
  ) / 10_000;
  return Math.max(0, Math.min(1, 1 - ratio));
}
