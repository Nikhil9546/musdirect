// @musdirect/x402 — drop-in HTTP 402 middleware + client helpers for the
// MUSDirect Debit reactive payment primitive on Mezo.
//
// The unification thesis: every MUSD payment on Mezo — recurring or reactive
// — checks the payer's Trove ICR before settling. Schedules use createSchedule
// + executePayment; APIs use executeOneShot. Same CR gate; same Recovery Mode
// floor; same MEZO drip to keepers/middleware operators.

export { createX402Middleware } from "./server";
export { x402Pay, fetchWith402, type PayResult, type PayOptions } from "./client";
export {
  verifyOneShotReceipt,
  createVerifyClient,
  type DecodedOneShot,
  type VerifyExpectation,
  type VerifyResult,
} from "./verify";
export {
  PAYMENT_RECEIPT_HEADER,
  type PaymentRequired,
  type RequirePaymentResult,
  type PaymentReceipt,
  type X402ServerConfig,
} from "./types";
export { MUSDIRECT_ONESHOT_ABI, ERC20_APPROVE_ABI } from "./abi";
