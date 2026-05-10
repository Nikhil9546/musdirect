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
