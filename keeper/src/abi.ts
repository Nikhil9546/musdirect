// Minimal ABI for MUSDirectDebit. Hand-curated rather than imported from forge
// artifacts so the keeper stays decoupled from the Solidity build pipeline and
// can run in environments where the contracts/ folder isn't present.
//
// If you change the contract surface, regenerate this from
//   contracts/out/MUSDirectDebit.sol/MUSDirectDebit.json -> abi
// and run `pnpm tsc` to catch breakage at compile time.

export const SCHEDULE_CREATED_EVENT = {
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

export const SCHEDULE_AUTO_CANCELLED_EVENT = {
  type: "event",
  name: "ScheduleAutoCancelled",
  inputs: [{ indexed: true, name: "scheduleId", type: "uint256" }],
} as const;

export const SCHEDULE_CANCELLED_EVENT = {
  type: "event",
  name: "ScheduleCancelled",
  inputs: [
    { indexed: true, name: "scheduleId", type: "uint256" },
    { indexed: true, name: "by", type: "address" },
  ],
} as const;

export const MUSDIRECT_DEBIT_ABI = [
  SCHEDULE_CREATED_EVENT,
  SCHEDULE_AUTO_CANCELLED_EVENT,
  SCHEDULE_CANCELLED_EVENT,
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
    stateMutability: "nonpayable",
    name: "executePayment",
    inputs: [{ name: "scheduleId", type: "uint256" }],
    outputs: [],
  },
  // Custom errors — used by the keeper to classify reverts cheaply.
  { type: "error", name: "TooEarly", inputs: [{ name: "nextExec", type: "uint64" }] },
  { type: "error", name: "ScheduleNotActive", inputs: [] },
  { type: "error", name: "UnknownSchedule", inputs: [] },
  {
    type: "error",
    name: "CrBelowThreshold",
    inputs: [
      { name: "currentICR", type: "uint256" },
      { name: "effectiveMinCR", type: "uint256" },
    ],
  },
] as const;

export type ScheduleStatus = 0 | 1 | 2 | 3; // Active | Paused | Cancelled | AutoCancelled

export const STATUS_ACTIVE = 0 as const;
