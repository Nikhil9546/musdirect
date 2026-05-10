import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "MUSDirect Debit",
  description: "Auto-pay your rent in MUSD without risking your Bitcoin.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-mezo-ink text-white antialiased">
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
