import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { RuntimeErrorFilter } from "@/components/RuntimeErrorFilter";
import "./globals.css";

export const metadata: Metadata = {
  title: "MUSDirect Debit",
  description: "Auto-pay your rent in MUSD without risking your Bitcoin.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <Script
        id="walletconnect-runtime-error-filter"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              function shouldIgnore(value) {
                var message = value && value.message ? value.message : String(value || "");
                return message.indexOf("Connection interrupted while trying to subscribe") !== -1;
              }
              window.addEventListener("error", function (event) {
                if (shouldIgnore(event.error || event.message)) {
                  event.preventDefault();
                  event.stopImmediatePropagation();
                }
              }, true);
              window.addEventListener("unhandledrejection", function (event) {
                if (shouldIgnore(event.reason)) {
                  event.preventDefault();
                  event.stopImmediatePropagation();
                }
              }, true);
            })();
          `,
        }}
      />
      <body className="min-h-dvh">
        <RuntimeErrorFilter />
        {children}
      </body>
    </html>
  );
}
