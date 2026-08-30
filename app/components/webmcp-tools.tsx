"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useCurrentUser } from "@/app/context/current-user-context";
import { useConfirmBridge } from "@/app/context/confirm-bridge-context";
import { useWebmcpActivity } from "@/app/context/webmcp-activity-context";
import { createClient } from "@/app/libs/supabase/client";
import { registerWebmcpTools } from "@/lib/webmcp/register";

/**
 * Registers the app's WebMCP tools once a user is signed in, and tears them
 * down on sign-out or unmount. Renders nothing -- this is a pure side
 * effect, the visible half is <ActivityPanel />.
 */
const WebmcpTools = () => {
  const currentUser = useCurrentUser();
  const router = useRouter();
  const { requestConfirmation } = useConfirmBridge();
  const { logEvent, setEnabled } = useWebmcpActivity();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    const register = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      registerWebmcpTools(
        {
          supabase: createClient(),
          currentUser,
          navigate: (href) => router.push(href),
          requestConfirmation,
        },
        logEvent,
        controller.signal
      ).then(setEnabled);
    };

    register();

    // document.modelContext only exists in a WebMCP-capable agent browser --
    // this lets a plain browser register once the flag/polyfill appears
    // without needing a full reload, and is also how manual testing
    // (window.__webmcpDebugRegister()) re-registers after injecting a mock.
    if (typeof window !== "undefined") {
      (window as any).__webmcpDebugRegister = register;
    }

    return () => {
      abortRef.current?.abort();
      setEnabled(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  return null;
};

export default WebmcpTools;
