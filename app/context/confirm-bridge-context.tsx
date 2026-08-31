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
 * `requestUserInteraction()` isn't reliably implemented across agents yet.
 * No current tool gates on this: a voice/chat session has nobody watching
 * the browser tab to click an in-page dialog, so every write tool that
 * needs confirmation (draft_message + send_message, delete_conversation's
 * confirm: true) uses a second explicit tool call instead. Kept as
 * infrastructure for a future tool where the human is known to be at the
 * browser -- e.g. something only reachable from a UI button, never voice.
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
