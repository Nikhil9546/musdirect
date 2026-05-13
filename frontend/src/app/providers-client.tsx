"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { PassportProvider } from "@mezo-org/passport";

import "@rainbow-me/rainbowkit/styles.css";

import { buildWagmiConfig } from "@/lib/wagmi";
import { NETWORK } from "@/lib/env";

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [wagmiConfig] = useState(() => (typeof window === "undefined" ? null : buildWagmiConfig()));

  if (!mounted || !wagmiConfig) {
    return null;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: "#FF7100",
            accentColorForeground: "#ffffff",
            borderRadius: "large",
          })}
        >
          <PassportProvider environment={NETWORK}>{children}</PassportProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
