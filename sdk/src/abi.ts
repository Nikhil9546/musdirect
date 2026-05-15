// Minimal subset of MUSDirectDebit + ERC-20 that the SDK uses at runtime.
// Hand-curated to keep the SDK bundle tiny (no contract artifact import).

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

export const MUSDIRECT_CREATE_ABI = [
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "createSchedule",
    inputs: [
      { name: "payee", type: "address" },
      { name: "amount", type: "uint128" },
      { name: "frequency", type: "uint64" },
      { name: "firstExec", type: "uint64" },
      { name: "expiry", type: "uint64" },
      { name: "totalSpentCap", type: "uint128" },
      { name: "minSafeCR", type: "uint128" },
    ],
    outputs: [{ name: "scheduleId", type: "uint256" }],
  },
] as const;
