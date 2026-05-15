import type { Address, Hex } from "viem";

/// The JSON body served in a 402 response. Clients parse this and use it to
/// build the on-chain payment.
export interface PaymentRequired {
  /// Spec version. Currently always "x402-musdirect-1".
  version: "x402-musdirect-1";
  /// Settlement scheme — distinguishes from other x402 dialects.
  scheme: "musdirect-oneshot";
  /// Chain id of the settlement network.
  chainId: number;
  /// Address of the deployed MUSDirectDebit contract.
  scheduler: Address;
  /// Address of the MUSD token (so client can approve once).
  musd: Address;
  /// Recipient that will receive the MUSD (minus fee).
  recipient: Address;
  /// Address whose Trove ICR will gate the payment. May equal the payer.
  troveOwner: Address;
  /// MUSD base-unit amount (1e18 = 1 MUSD).
  amount: string;
  /// CR floor scaled by 1e18 (e.g. "1500000000000000000" = 150%).
  minSafeCR: string;
  /// Server-issued nonce. Must be used verbatim in executeOneShot.
  requestId: Hex;
  /// Human-readable description for wallet UIs.
  human: string;
}

/// Headers a client attaches to a retry once it has settled the payment.
export const PAYMENT_RECEIPT_HEADER = "x-musdirect-payment";

/// What `requirePayment` returns to the calling route handler.
export type RequirePaymentResult =
  | {
      ok: true;
      /// Information about the verified on-chain payment.
      info: {
        requestId: Hex;
        txHash: Hex;
        payer: Address;
        payee: Address;
        troveOwner: Address;
        amount: bigint;
        currentICR: bigint;
      };
    }
  | {
      ok: false;
      /// Ready-to-return HTTP response (status 402 with payment instructions).
      response: Response;
    };

/// What a client sends as the receipt header (JSON-encoded then base64-url'd,
/// or sent as separate headers — see PAYMENT_RECEIPT_HEADER docs).
export interface PaymentReceipt {
  txHash: Hex;
  requestId: Hex;
}

export interface X402ServerConfig {
  /// Mezo testnet/mainnet chain id (e.g. 31611 for testnet).
  chainId: number;
  /// RPC used to verify receipts.
  rpcUrl: string;
  /// Deployed MUSDirectDebit address.
  schedulerAddress: Address;
  /// MUSD address — included in the 402 body for the client.
  musdAddress: Address;
  /// Address that receives the MUSD payment.
  recipient: Address;
  /// CR floor (1e18-scaled) the payer's Trove must satisfy.
  minSafeCR: bigint;
  /// Payment amount in MUSD base units.
  amountMusd: bigint;
  /// Address whose Trove gates the payment. Defaults to the payer (msg.sender)
  /// — overridable per-request via the `troveOwnerHeader` (see below).
  defaultTroveOwner?: Address;
  /// Optional header name a client can use to specify a different troveOwner.
  /// Defaults to "x-musdirect-trove-owner".
  troveOwnerHeader?: string;
  /// Used in the human-readable description of the 402 body.
  endpointLabel?: string;
  /// In-memory record of accepted requestIds — pluggable for production.
  /// Defaults to a Map. For multi-instance deployments, supply a Redis-backed
  /// store with the same .has / .add interface.
  seenStore?: { has(id: Hex): boolean | Promise<boolean>; add(id: Hex): void | Promise<void> };
}
