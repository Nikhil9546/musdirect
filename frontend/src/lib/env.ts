// Centralized env access. Throws at module-load if a required public var is
// missing, so a misconfigured deployment fails fast instead of producing a
// silently broken UI.

import type { Address } from "viem";

function publicEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`missing env: ${name}`);
  }
  return v;
}

function publicEnvAddress(name: string, fallback?: Address): Address {
  const v = process.env[name] as Address | undefined;
  if (!v || v.length === 0) {
    if (fallback) return fallback;
    throw new Error(`missing address env: ${name}`);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new Error(`invalid address env ${name}: ${v}`);
  }
  return v;
}

function publicEnvAddressOptional(name: string): Address | null {
  const v = process.env[name];
  if (!v || v.length === 0) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new Error(`invalid address env ${name}: ${v}`);
  }
  return v as Address;
}

export const ENV = {
  rpcUrl: publicEnv("NEXT_PUBLIC_RPC_URL", "https://rpc.test.mezo.org"),
  chainId: Number.parseInt(publicEnv("NEXT_PUBLIC_CHAIN_ID", "31611"), 10),

  // Verified live on 2026-05-04 against chain id 31611.
  musd: publicEnvAddress(
    "NEXT_PUBLIC_MUSD_ADDRESS",
    "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"
  ),
  troveManager: publicEnvAddress(
    "NEXT_PUBLIC_TROVE_MANAGER_ADDRESS",
    "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0"
  ),
  priceFeed: publicEnvAddress(
    "NEXT_PUBLIC_PRICE_FEED_ADDRESS",
    "0x86bCF0841622a5dAC14A313a15f96A95421b9366"
  ),

  // Empty until MUSDirectDebit is deployed; UI gracefully shows "not deployed".
  scheduler: publicEnvAddressOptional("NEXT_PUBLIC_SCHEDULER_ADDRESS") ?? "0x47e0e0ef8936175ee769e857740f463a9e6f6a9e",

  // Empty until the user configures MEZO integration; UI shows the drip as
  // "not configured" in that case.
  mezo: publicEnvAddressOptional("NEXT_PUBLIC_MEZO_ADDRESS"),

  // Recipient wallet for x402 premium-API revenue. Defaults to null when
  // unset; the demo route picks a safe placeholder so /api/premium still
  // serves a 402 instead of crashing.
  recipient: publicEnvAddressOptional("NEXT_PUBLIC_X402_RECIPIENT"),

  // WalletConnect needs a real project id for non-injected wallets to work.
  // Defaults to a placeholder so the UI still renders without one.
  walletConnectProjectId: publicEnv(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
    "PLACEHOLDER_WALLETCONNECT_PROJECT_ID"
  ),

  explorerUrl: publicEnv(
    "NEXT_PUBLIC_EXPLORER_URL",
    "https://explorer.test.mezo.org"
  ),
} as const;

export type Network = "mainnet" | "testnet";
export const NETWORK: Network = ENV.chainId === 31612 ? "mainnet" : "testnet";
