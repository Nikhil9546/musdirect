// Minimal ABIs for the live-chain reads the frontend performs.
// Full MUSDirectDebit ABI lives in keeper/src/abi.ts; we copy only what the
// UI calls, to keep the bundle small.

export const ERC20_ABI = [
  {
    type: "function",
    stateMutability: "view",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export const TROVE_MANAGER_ABI = [
  {
    type: "function",
    stateMutability: "view",
    name: "getCurrentICR",
    inputs: [
      { name: "_borrower", type: "address" },
      { name: "_price", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "checkRecoveryMode",
    inputs: [{ name: "_price", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// PriceFeed.fetchPrice() is non-view on-chain (it updates state), but
// eth_call still returns the would-be value, so we read it as a view from the UI.
export const PRICE_FEED_READ_ABI = [
  {
    type: "function",
    stateMutability: "view",
    name: "fetchPrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
