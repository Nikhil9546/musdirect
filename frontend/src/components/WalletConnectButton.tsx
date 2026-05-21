"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletConnectButton({
  label = "Connect",
}: {
  label?: string;
}) {
  return (
    <ConnectButton
      label={label}
      accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
      chainStatus="icon"
    />
  );
}
