"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { PassportProvider } from "@mezo-org/passport";

import "@rainbow-me/rainbowkit/styles.css";

import { buildWagmiConfig } from "@/lib/wagmi";
import { NETWORK } from "@/lib/env";

export function Providers({ children }: { children: ReactNode }) {
  // Defer mounting the wagmi tree until the client mounts — getConfig() reaches
  // for window, which doesn't exist during SSR. A bare shell renders for the
  // first paint; the providers attach immediately after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // QueryClient must be created inside the client component so we get one per
  // hydration; sharing across requests would leak state between users on SSR.
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

  // Lazy build — only runs after `mounted` flips, i.e. on the client.
  const [wagmiConfig] = useState(() => (typeof window === "undefined" ? null : buildWagmiConfig()));

  if (!mounted || !wagmiConfig) {
    // SSR / pre-hydration shell — keeps page structure stable so the layout
    // doesn't jump when providers attach.
    return <div suppressHydrationWarning>{children}</div>;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#FF7100",
            accentColorForeground: "#0E0E0E",
            borderRadius: "medium",
          })}
        >
          <PassportProvider environment={NETWORK}>{children}</PassportProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
