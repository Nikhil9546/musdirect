"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Hard SSR boundary — Mezo Passport's RainbowKit/OrangeKit chain reaches for
// `window` at module-load time (injected provider sniffing). Loading the whole
// stack only on the client keeps SSR clean and removes a class of hydration
// mismatch bugs entirely.
const ProvidersClient = dynamic(
  () => import("./providers-client").then((m) => m.Providers),
  { ssr: false }
);

export function Providers({ children }: { children: ReactNode }) {
  return <ProvidersClient>{children}</ProvidersClient>;
}
