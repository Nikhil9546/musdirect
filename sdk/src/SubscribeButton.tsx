"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Address } from "viem";

import { ERC20_APPROVE_ABI, MUSDIRECT_CREATE_ABI } from "./abi.js";

export interface SubscribeButtonProps {
  /** Where the recurring payment lands. Typically the dApp's revenue address. */
  payee: Address;
  /** MUSD address. Defaults to live Mezo testnet MUSD. */
  musdAddress?: Address;
  /** Deployed MUSDirectDebit address. */
  schedulerAddress: Address;
  /** Per-period amount in MUSD base units (1e18 = 1 MUSD). */
  amount: bigint;
  /** Cadence in seconds (e.g. 30 * 86400 for monthly). */
  frequency: bigint;
  /** Total lifetime cap in MUSD base units. Must be ≥ amount. */
  totalSpentCap: bigint;
  /**
   * User's collateral-ratio floor, scaled by 1e18 (250% → 2.5e18). When the
   * payer's Trove CR falls below this, the contract skips execution and
   * notifies them — this is the load-bearing safety primitive.
   */
  minSafeCR: bigint;
  /** Schedule lifetime in seconds. Defaults to 365 days. */
  durationSec?: bigint;
  /** Override the rendered label. Defaults to "Subscribe with MUSD". */
  label?: string;
  /** Tailwind-style className override on the button. */
  className?: string;
  /** Fires after the createSchedule tx is mined. */
  onCreated?: (txHash: `0x${string}`) => void;
}

const DEFAULT_MUSD: Address = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

/// Drop-in subscribe-with-MUSD button for third-party Mezo dApps.
/// Wires the user's wallet → approve → createSchedule in two clicks (one if the
/// allowance is already sufficient). Re-renders state as the user moves
/// through the flow.
export function SubscribeButton(props: SubscribeButtonProps) {
  const {
    payee,
    musdAddress = DEFAULT_MUSD,
    schedulerAddress,
    amount,
    frequency,
    totalSpentCap,
    minSafeCR,
    durationSec = 365n * 86_400n,
    label = "Subscribe with MUSD",
    className,
    onCreated,
  } = props;

  const { address: payer } = useAccount();

  const { data: allowance } = useReadContract({
    address: musdAddress,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: payer ? [payer, schedulerAddress] : undefined,
    query: { enabled: Boolean(payer) },
  });

  const needsApproval =
    allowance === undefined || (allowance as bigint) < totalSpentCap;

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });

  const create = useWriteContract();
  const createReceipt = useWaitForTransactionReceipt({ hash: create.data });

  const [stage, setStage] = useState<"idle" | "approve" | "create" | "done" | "err">("idle");

  useEffect(() => {
    if (approveReceipt.isSuccess && stage === "approve") {
      setStage("create");
      submitCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess]);

  useEffect(() => {
    if (createReceipt.isSuccess && create.data) {
      setStage("done");
      onCreated?.(create.data);
    }
  }, [createReceipt.isSuccess, create.data, onCreated]);

  function submitApprove() {
    setStage("approve");
    approve.writeContract({
      address: musdAddress,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [schedulerAddress, totalSpentCap],
    });
  }

  function submitCreate() {
    setStage("create");
    const now = BigInt(Math.floor(Date.now() / 1000));
    create.writeContract({
      address: schedulerAddress,
      abi: MUSDIRECT_CREATE_ABI,
      functionName: "createSchedule",
      args: [
        payee,
        amount,
        frequency,
        now,
        now + durationSec,
        totalSpentCap,
        minSafeCR,
      ],
    });
  }

  function onClick() {
    if (!payer) return;
    if (needsApproval) submitApprove();
    else submitCreate();
  }

  const busy =
    approve.isPending || approveReceipt.isFetching ||
    create.isPending || createReceipt.isFetching;

  const cls =
    className ??
    "inline-flex items-center gap-2 rounded-full border-2 border-black bg-[#FF7100] px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_black] disabled:opacity-50";

  const text =
    stage === "approve" ? "Approving…" :
    stage === "create" ? "Creating schedule…" :
    stage === "done" ? "Subscribed ✓" :
    !payer ? "Connect wallet to subscribe" :
    needsApproval ? `Approve & ${label}` :
    label;

  return (
    <button onClick={onClick} disabled={!payer || busy || stage === "done"} className={cls}>
      {text}
    </button>
  );
}
