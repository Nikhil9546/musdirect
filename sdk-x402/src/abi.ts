// Minimal ABI surface for x402 — just the one-shot path on MUSDirectDebit
// plus the events the verifier decodes. Hand-curated to keep the dependency
// surface tiny.

export const MUSDIRECT_ONESHOT_ABI = [
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "executeOneShot",
    inputs: [
      { name: "troveOwner", type: "address" },
      { name: "payee", type: "address" },
      { name: "amount", type: "uint128" },
      { name: "minSafeCR", type: "uint128" },
      { name: "requestId", type: "bytes32" },
    ],
    outputs: [{ name: "currentICR", type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "paidRequests",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "OneShotPaid",
    inputs: [
      { indexed: true, name: "requestId", type: "bytes32" },
      { indexed: true, name: "payer", type: "address" },
      { indexed: true, name: "payee", type: "address" },
      { indexed: false, name: "troveOwner", type: "address" },
      { indexed: false, name: "amount", type: "uint128" },
      { indexed: false, name: "fee", type: "uint128" },
      { indexed: false, name: "currentICR", type: "uint256" },
    ],
  },
  // Custom errors — surface for client retry decisions.
  {
    type: "error",
    name: "CrBelowThreshold",
    inputs: [
      { name: "currentICR", type: "uint256" },
      { name: "effectiveMinCR", type: "uint256" },
    ],
  },
  { type: "error", name: "RequestAlreadyPaid", inputs: [{ name: "requestId", type: "bytes32" }] },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    stateMutability: "view",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
