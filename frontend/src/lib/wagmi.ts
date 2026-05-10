// Wagmi config built via Mezo Passport's getConfig — pre-wires Bitcoin wallets
// (Unisat, OKX, Xverse) plus the standard EVM wallets through RainbowKit, with
// the correct Mezo chain (mainnet or testnet) selected automatically.
//
// IMPORTANT: getConfig() touches `window` at call time (it sniffs injected
// providers). It must NOT run during SSR. We export a factory function rather
// than the config itself; Providers calls it lazily inside a useState
// initializer so it only ever runs after hydration on the client.

import { getConfig } from "@mezo-org/passport";

import { ENV, NETWORK } from "./env";

export function buildWagmiConfig() {
  return getConfig({
    appName: "MUSDirect Debit",
    appDescription: "Auto-pay your rent in MUSD without risking your Bitcoin.",
    appUrl: "https://musdirect.xyz",
    mezoNetwork: NETWORK,
    walletConnectProjectId: ENV.walletConnectProjectId,
  });
}
