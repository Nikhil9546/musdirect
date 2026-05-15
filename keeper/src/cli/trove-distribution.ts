// Validation experiment 1 (PRD §13).
//
// Enumerates all live Mezo testnet Troves via TroveManager.getTroveOwnersCount
// + TroveManager.TroveOwners(i), reads each borrower's current ICR, and prints
// a histogram of CR buckets. Recommends a sensible default `minSafeCR` for the
// frontend slider based on where p25 of the live population sits.
//
// Methodology: we sample the live system, not historical events. This is the
// authoritative answer to "what does the user base actually look like".
//
// Run:
//   pnpm trove-distribution

import { createPublicClient, http, parseAbi, type Address } from "viem";

const TROVE_MANAGER = "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0" as const;
const PRICE_FEED = "0x86bCF0841622a5dAC14A313a15f96A95421b9366" as const;
const RPC = process.env.RPC_URL ?? "https://rpc.test.mezo.org";

const TROVE_MANAGER_ABI = parseAbi([
  "function getCurrentICR(address borrower, uint256 price) view returns (uint256)",
  "function getTroveOwnersCount() view returns (uint256)",
  "function TroveOwners(uint256) view returns (address)",
]);

const PRICE_FEED_ABI = parseAbi([
  "function fetchPrice() view returns (uint256)",
]);

const MAX_UINT256 = 2n ** 256n - 1n;

async function main() {
  const client = createPublicClient({ transport: http(RPC) });

  const head = await client.getBlockNumber();
  console.log(`Mezo testnet head: ${head}`);

  const price = (await client.readContract({
    address: PRICE_FEED,
    abi: PRICE_FEED_ABI,
    functionName: "fetchPrice",
  })) as bigint;
  const priceUsd = Number(price / 10n ** 18n);
  console.log(`Live BTC price:    $${priceUsd.toLocaleString()}\n`);

  const count = (await client.readContract({
    address: TROVE_MANAGER,
    abi: TROVE_MANAGER_ABI,
    functionName: "getTroveOwnersCount",
  })) as bigint;
  console.log(`Active Troves: ${count}\n`);

  if (count === 0n) {
    console.log("No live Troves — UI default should be 250%.");
    return;
  }

  console.log("Reading current ICR for each Trove…");
  const icrs: number[] = [];
  for (let i = 0n; i < count; i++) {
    const borrower = (await client.readContract({
      address: TROVE_MANAGER,
      abi: TROVE_MANAGER_ABI,
      functionName: "TroveOwners",
      args: [i],
    })) as Address;
    try {
      const icr = (await client.readContract({
        address: TROVE_MANAGER,
        abi: TROVE_MANAGER_ABI,
        functionName: "getCurrentICR",
        args: [borrower, price],
      })) as bigint;
      if (icr === MAX_UINT256) continue;
      const pct = Number((icr * 10_000n) / 10n ** 18n) / 100;
      icrs.push(pct);
    } catch {
      // ignore individual read failures
    }
    if ((i + 1n) % 25n === 0n) {
      process.stdout.write(`  ${i + 1n}/${count}\r`);
    }
  }
  console.log(`  ${icrs.length}/${count} read successfully.\n`);

  icrs.sort((a, b) => a - b);
  if (icrs.length === 0) {
    console.log("All ICRs unreadable. Default recommendation: 250%.");
    return;
  }

  // ── Histogram ─────────────────────────────────────────────────────────────
  const BUCKETS = [
    [0, 110],
    [110, 130],
    [130, 150],
    [150, 200],
    [200, 250],
    [250, 300],
    [300, 400],
    [400, 600],
    [600, 1_000_000],
  ] as const;
  console.log("CR distribution among live Troves:");
  console.log("  bucket          count    bar");
  for (const [lo, hi] of BUCKETS) {
    const n = icrs.filter((v) => v >= lo && v < hi).length;
    const barLen = Math.ceil((n / icrs.length) * 40);
    const bar = "█".repeat(Math.min(40, barLen));
    const label = hi === 1_000_000 ? `${lo}%+` : `${lo}–${hi}%`;
    console.log(`  ${label.padEnd(12)}    ${String(n).padStart(4)}    ${bar}`);
  }

  const p10 = pct(icrs, 0.1);
  const p25 = pct(icrs, 0.25);
  const p50 = pct(icrs, 0.5);
  const p75 = pct(icrs, 0.75);
  console.log(`\n  count: ${icrs.length}`);
  console.log(`  min:   ${icrs[0]?.toFixed(1)}%`);
  console.log(`  p10:   ${p10.toFixed(1)}%`);
  console.log(`  p25:   ${p25.toFixed(1)}%`);
  console.log(`  p50:   ${p50.toFixed(1)}%`);
  console.log(`  p75:   ${p75.toFixed(1)}%`);

  // The slider default should sit a comfortable distance below p25 — close
  // enough that most users see "safe headroom > 0" out of the box, far enough
  // that the gate is not constantly firing. Round to the nearest 10%; clamp
  // to [200%, 300%] so outlier-skewed populations don't produce wild values.
  const raw = p25 - 10;
  const rounded = Math.round(raw / 10) * 10;
  const recommended = Math.max(200, Math.min(300, rounded));
  console.log(
    `\nRecommended default minSafeCR for the form slider: ${recommended}%`
  );
  console.log(
    `  (chosen as clamp(round(p25 − 10, nearest 10%), [200%, 300%]) = clamp(${rounded}, [200, 300]))`
  );
}

function pct(xs: number[], p: number): number {
  const i = Math.min(xs.length - 1, Math.max(0, Math.floor(p * xs.length)));
  return xs[i] ?? 0;
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
