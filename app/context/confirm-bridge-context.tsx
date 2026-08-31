"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { PropsWithChildren } from "react";

import type { ConfirmRequest } from "@/lib/webmcp/types";
import ConfirmDialog from "@/app/components/modals/confirm-dialog";

type PendingConfirm = ConfirmRequest & { resolve: (confirmed: boolean) => void };

type ConfirmBridgeValue = {
  requestConfirmation: (request: ConfirmRequest) => Promise<boolean>;
};

const ConfirmBridgeContext = createContext<ConfirmBridgeValue | null>(null);

/**
 * Lets non-React code (a WebMCP tool's execute()) pop the app's own confirm
 * dialog and await the answer, instead of trusting the agent to ask --
 * `requestUserInteraction()` isn't reliably implemented across agents yet,
 * so delete_conversation gates here unconditionally. send_message doesn't:
 * draft_message + send_message already being two separate tool calls is
 * the confirmation step, and a second in-page dialog nobody is watching
 * (the user is talking to the agent, not the browser tab) just hangs until
 * it times out.
 */
export function ConfirmBridgeProvider({ children }: PropsWithChildren) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const settling = useRef(false);

  const requestConfirmation = useCallback((request: ConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...request, resolve });
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    if (settling.current) return;
    settling.current = true;

    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });

    settling.current = false;
  }, []);

  return (
    <ConfirmBridgeContext.Provider value={{ requestConfirmation }}>
      {children}
      <ConfirmDialog
        isOpen={!!pending}
        title={pending?.title ?? ""}
        body={pending?.body ?? ""}
        confirmLabel={pending?.confirmLabel ?? "Confirm"}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmBridgeContext.Provider>
  );
}

export function useConfirmBridge() {
  const ctx = useContext(ConfirmBridgeContext);
  if (!ctx) throw new Error("useConfirmBridge must be used within ConfirmBridgeProvider");
  return ctx;
}
