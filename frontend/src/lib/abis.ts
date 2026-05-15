// Minimal ABIs for the frontend's reads + writes. Full MUSDirectDebit ABI is in
// keeper/src/abi.ts; here we copy only what the UI actually calls to keep the
// bundle small. If you change the contract surface, regenerate from
// `contracts/out/MUSDirectDebit.sol/MUSDirectDebit.json`.

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
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
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

// PriceFeed.fetchPrice() is non-view on-chain (it updates the cached round)
// but eth_call still returns the would-be value — safe to read as view.
export const PRICE_FEED_READ_ABI = [
  {
    type: "function",
    stateMutability: "view",
    name: "fetchPrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// MUSDirectDebit
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEDULE_CREATED_EVENT_ABI = {
  type: "event",
  name: "ScheduleCreated",
  inputs: [
    { indexed: true, name: "scheduleId", type: "uint256" },
    { indexed: true, name: "payer", type: "address" },
    { indexed: true, name: "payee", type: "address" },
    { indexed: false, name: "amount", type: "uint128" },
    { indexed: false, name: "frequency", type: "uint64" },
    { indexed: false, name: "nextExec", type: "uint64" },
    { indexed: false, name: "expiry", type: "uint64" },
    { indexed: false, name: "totalSpentCap", type: "uint128" },
    { indexed: false, name: "minSafeCR", type: "uint128" },
  ],
} as const;

export const MUSDIRECT_DEBIT_ABI = [
  SCHEDULE_CREATED_EVENT_ABI,
  {
    type: "function",
    stateMutability: "view",
    name: "getSchedule",
    inputs: [{ name: "scheduleId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "payer", type: "address" },
          { name: "payee", type: "address" },
          { name: "amount", type: "uint128" },
          { name: "totalSpent", type: "uint128" },
          { name: "totalSpentCap", type: "uint128" },
          { name: "frequency", type: "uint64" },
          { name: "nextExec", type: "uint64" },
          { name: "expiry", type: "uint64" },
          { name: "minSafeCR", type: "uint128" },
          { name: "status", type: "uint8" },
          { name: "failureCount", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "isDue",
    inputs: [{ name: "scheduleId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "nextScheduleId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
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
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "cancelSchedule",
    inputs: [{ name: "scheduleId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "pauseSchedule",
    inputs: [{ name: "scheduleId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "resumeSchedule",
    inputs: [{ name: "scheduleId", type: "uint256" }],
    outputs: [],
  },
  // Custom errors — surface to the UI when a write fails.
  { type: "error", name: "InvalidAmount", inputs: [] },
  { type: "error", name: "InvalidFrequency", inputs: [] },
  { type: "error", name: "InvalidExpiry", inputs: [] },
  { type: "error", name: "InvalidPayee", inputs: [] },
  { type: "error", name: "InvalidMinCR", inputs: [] },
  { type: "error", name: "CapBelowFirstPayment", inputs: [] },
  { type: "error", name: "UnknownSchedule", inputs: [] },
  { type: "error", name: "NotScheduleOwner", inputs: [] },
  { type: "error", name: "ScheduleNotActive", inputs: [] },
] as const;

// Schedule.status enum mirror.
export const STATUS_ACTIVE = 0;
export const STATUS_PAUSED = 1;
export const STATUS_CANCELLED = 2;
export const STATUS_AUTO_CANCELLED = 3;

export type ScheduleStatus = 0 | 1 | 2 | 3;

export function statusLabel(s: number): string {
  switch (s) {
    case STATUS_ACTIVE:
      return "Active";
    case STATUS_PAUSED:
      return "Paused";
    case STATUS_CANCELLED:
      return "Cancelled";
    case STATUS_AUTO_CANCELLED:
      return "Auto-cancelled";
    default:
      return "Unknown";
  }
}
