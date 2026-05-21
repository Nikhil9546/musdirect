"use client";

import { useEffect } from "react";

function isIgnorableWalletConnectError(value: unknown) {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : value && typeof value === "object" && "message" in value
          ? String(value.message)
          : "";

  return message.includes("Connection interrupted while trying to subscribe");
}

export function RuntimeErrorFilter() {
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isIgnorableWalletConnectError(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    function onError(event: ErrorEvent) {
      if (isIgnorableWalletConnectError(event.error ?? event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("unhandledrejection", onUnhandledRejection, true);
    window.addEventListener("error", onError, true);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection, true);
      window.removeEventListener("error", onError, true);
    };
  }, []);

  return null;
}
