"use client";

import { usePathname } from "next/navigation";

import { buildAuthLandingPath } from "@/app/libs/auth/return-path";

import type { ConnectionStatusName } from "./connection-state";
import { useWebMCPConnection } from "./connection-provider";

const VISIBLE_LABELS: Record<ConnectionStatusName, string> = {
  SIGNED_OUT: "Sign in required",
  AUTHENTICATING: "Signing in",
  SESSION_READY: "Connecting Messenger",
  TOOLS_REGISTERING: "Connecting Messenger",
  CONNECTED: "Messenger connected",
  SIGNED_IN_TOOLS_UNAVAILABLE: "Agent tools unavailable",
  SIGNED_IN_TOOLS_FAILED: "Connection failed",
  SESSION_EXPIRED: "Session expired",
};

export const ConnectionStatusIndicator = () => {
  const pathname = usePathname();
  const { state, message, retryConnection } = useWebMCPConnection();
  const visibleLabel = VISIBLE_LABELS[state.status];

  return (
    <div className="fixed bottom-4 right-4 z-40 rounded-full bg-white px-3 py-2 text-sm text-gray-700 shadow">
      <span aria-hidden="true">{visibleLabel}</span>
      {state.status === "SIGNED_IN_TOOLS_FAILED" ? (
        <button type="button" onClick={retryConnection}>
          Retry agent connection
        </button>
      ) : state.status === "SESSION_EXPIRED" ? (
        <a href={buildAuthLandingPath(pathname)}>Sign in again</a>
      ) : null}
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </span>
    </div>
  );
};
