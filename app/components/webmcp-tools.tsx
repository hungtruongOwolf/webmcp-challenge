"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

import { useCurrentUser } from "@/app/context/current-user-context";
import { useConfirmBridge } from "@/app/context/confirm-bridge-context";
import { useWebmcpActivity } from "@/app/context/webmcp-activity-context";
import { createClient } from "@/app/libs/supabase/client";
import { useWebMCPConnection } from "@/app/webmcp/connection-provider";
import { createWebmcpTools } from "@/lib/webmcp/register";

/**
 * Supplies the Messenger catalog to the root session lifecycle. The provider
 * remains the only owner of browser registration and abort cleanup.
 */
const WebmcpTools = () => {
  const currentUser = useCurrentUser();
  const currentUserRef = useRef(currentUser);
  const router = useRouter();
  const { requestConfirmation } = useConfirmBridge();
  const { logEvent, setEnabled } = useWebmcpActivity();
  const { state, replaceAuthenticatedTools } = useWebMCPConnection();
  const currentUserId = currentUser?.id ?? null;

  currentUserRef.current = currentUser;

  const tools = useMemo(() => {
    if (currentUserId === null) return [];

    const supabase = createClient();
    const context = {
      supabase,
      get currentUser() {
        return currentUserRef.current!;
      },
      navigate: (href: string) => router.push(href),
      requestConfirmation,
    };

    return createWebmcpTools(context, logEvent);
  }, [currentUserId, logEvent, requestConfirmation, router]);

  useEffect(() => {
    replaceAuthenticatedTools(tools);
    return () => replaceAuthenticatedTools([]);
  }, [replaceAuthenticatedTools, tools]);

  useEffect(() => {
    setEnabled(
      currentUserId !== null && state.status === "CONNECTED"
    );
  }, [currentUserId, setEnabled, state.status]);

  return null;
};

export default WebmcpTools;
