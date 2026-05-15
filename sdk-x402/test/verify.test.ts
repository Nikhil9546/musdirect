import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  keccak256,
  toBytes,
  toEventSelector,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";

import { verifyOneShotReceipt } from "../src/verify.js";

const SCHEDULER = "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9" as Address;
const RECIPIENT = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;
const PAYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cfFFb92266" as Address;
const TROVE_OWNER = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" as Address;
const REQUEST_ID = "0x" + "ab".repeat(32) as Hex;

const ONESHOT_PAID_SELECTOR = toEventSelector(
  "OneShotPaid(bytes32,address,address,address,uint128,uint128,uint256)"
);

function makeOneShotLog(args: {
  requestId: Hex;
  payer: Address;
  payee: Address;
  troveOwner: Address;
  amount: bigint;
  fee: bigint;
  currentICR: bigint;
}) {
  return {
    address: SCHEDULER,
    topics: [
      ONESHOT_PAID_SELECTOR,
      args.requestId,
      ("0x" + args.payer.slice(2).toLowerCase().padStart(64, "0")) as Hex,
      ("0x" + args.payee.slice(2).toLowerCase().padStart(64, "0")) as Hex,
    ] as const,
    data: encodeAbiParameters(
      [
        { name: "troveOwner", type: "address" },
        { name: "amount", type: "uint128" },
        { name: "fee", type: "uint128" },
        { name: "currentICR", type: "uint256" },
      ],
      [args.troveOwner, args.amount, args.fee, args.currentICR]
    ),
  };
}

function makeReceipt(
  logs: ReturnType<typeof makeOneShotLog>[],
  status: "success" | "reverted" = "success"
): TransactionReceipt {
  return {
    status,
    to: SCHEDULER,
    logs: logs as unknown as TransactionReceipt["logs"],
    transactionHash: keccak256(toBytes("tx")),
  } as unknown as TransactionReceipt;
}

function mockClient(receipt: TransactionReceipt | Error): PublicClient {
  return {
    getTransactionReceipt: vi.fn(async () => {
      if (receipt instanceof Error) throw receipt;
      return receipt;
    }),
  } as unknown as PublicClient;
}

describe("verifyOneShotReceipt", () => {
  const txHash = ("0x" + "11".repeat(32)) as Hex;
  const happyLog = makeOneShotLog({
    requestId: REQUEST_ID,
    payer: PAYER,
    payee: RECIPIENT,
    troveOwner: TROVE_OWNER,
    amount: 3n * 10n ** 18n,
    fee: 7_500_000_000_000_000n, // 25 bps
    currentICR: 4n * 10n ** 18n,
  });

  it("returns ok for a matching receipt", async () => {
    const result = await verifyOneShotReceipt(mockClient(makeReceipt([happyLog])), txHash, {
      requestId: REQUEST_ID,
      schedulerAddress: SCHEDULER,
      recipient: RECIPIENT,
      minAmount: 3n * 10n ** 18n,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decoded.amount).toBe(3n * 10n ** 18n);
      expect(result.decoded.troveOwner.toLowerCase()).toBe(TROVE_OWNER.toLowerCase());
    }
  });

  it("rejects a reverted tx", async () => {
    const result = await verifyOneShotReceipt(
      mockClient(makeReceipt([happyLog], "reverted")),
      txHash,
      { requestId: REQUEST_ID, schedulerAddress: SCHEDULER, recipient: RECIPIENT, minAmount: 1n }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/reverted/);
  });

  it("rejects a tx sent to the wrong contract", async () => {
    const wrong = makeReceipt([happyLog]);
    (wrong as { to: Address }).to = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as Address;
    const result = await verifyOneShotReceipt(mockClient(wrong), txHash, {
      requestId: REQUEST_ID,
      schedulerAddress: SCHEDULER,
      recipient: RECIPIENT,
      minAmount: 1n,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/scheduler/);
  });

  it("rejects a receipt where the amount is too low", async () => {
    const result = await verifyOneShotReceipt(mockClient(makeReceipt([happyLog])), txHash, {
      requestId: REQUEST_ID,
      schedulerAddress: SCHEDULER,
      recipient: RECIPIENT,
      minAmount: 10n * 10n ** 18n, // demand 10 MUSD, log has 3
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/amount/);
  });

  it("rejects a receipt with the wrong recipient", async () => {
    const result = await verifyOneShotReceipt(mockClient(makeReceipt([happyLog])), txHash, {
      requestId: REQUEST_ID,
      schedulerAddress: SCHEDULER,
      recipient: PAYER, // expecting a different payee
      minAmount: 1n,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/payee/);
  });

  it("rejects a receipt that has no OneShotPaid log", async () => {
    const result = await verifyOneShotReceipt(mockClient(makeReceipt([])), txHash, {
      requestId: REQUEST_ID,
      schedulerAddress: SCHEDULER,
      recipient: RECIPIENT,
      minAmount: 1n,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no matching/);
  });

  it("rejects when the tx isn't mined yet", async () => {
    const result = await verifyOneShotReceipt(
      mockClient(new Error("not found")),
      txHash,
      {
        requestId: REQUEST_ID,
        schedulerAddress: SCHEDULER,
        recipient: RECIPIENT,
        minAmount: 1n,
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not yet mined/);
  });

  it("enforces expectedTroveOwner when provided", async () => {
    const otherOwner = "0x1111111111111111111111111111111111111111" as Address;
    const result = await verifyOneShotReceipt(mockClient(makeReceipt([happyLog])), txHash, {
      requestId: REQUEST_ID,
      schedulerAddress: SCHEDULER,
      recipient: RECIPIENT,
      minAmount: 1n,
      expectedTroveOwner: otherOwner,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/troveOwner/);
  });
});
