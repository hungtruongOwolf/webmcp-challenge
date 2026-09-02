"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

import { useCurrentUser } from "@/app/context/current-user-context";
import { useConfirmBridge } from "@/app/context/confirm-bridge-context";
import { useConversationsList } from "@/app/context/conversations-context";
import { useWebmcpActivity } from "@/app/context/webmcp-activity-context";
import useActiveList from "@/app/hooks/use-active-list";
import { createClient } from "@/app/libs/supabase/client";
import { useWebMCPConnection } from "@/app/webmcp/connection-provider";
import { createWebmcpTools } from "@/lib/webmcp/register";
import type { ToolContext } from "@/lib/webmcp/types";

/**
 * Supplies the Messenger catalog to the root session lifecycle. The provider
 * remains the only owner of browser registration and abort cleanup.
 */
const WebmcpTools = () => {
  const currentUser = useCurrentUser();
  const router = useRouter();
  const { requestConfirmation } = useConfirmBridge();
  const { subscribeToInbox, isInboxLive } = useConversationsList();
  const { logEvent, setEnabled } = useWebmcpActivity();
  const { state, replaceAuthenticatedTools } = useWebMCPConnection();
  const currentUserId = currentUser?.id ?? null;

  // The catalog is built once per signed-in user. Everything that can change
  // identity between renders (router, confirm bridge, inbox feed, activity
  // log, the user object itself) is read through a ref, so a navigation never
  // produces a new catalog and the agent's registered tools never go stale.
  const currentUserRef = useRef(currentUser);
  const routerRef = useRef(router);
  const requestConfirmationRef = useRef(requestConfirmation);
  const subscribeToInboxRef = useRef(subscribeToInbox);
  const isInboxLiveRef = useRef(isInboxLive);
  const logEventRef = useRef(logEvent);
  // A layout effect, not a render-time write: it lands before paint and
  // before any tool can run, without mutating refs inside render.
  useLayoutEffect(() => {
    currentUserRef.current = currentUser;
    routerRef.current = router;
    requestConfirmationRef.current = requestConfirmation;
    subscribeToInboxRef.current = subscribeToInbox;
    isInboxLiveRef.current = isInboxLive;
    logEventRef.current = logEvent;
  });

  const tools = useMemo(() => {
    if (currentUserId === null) return [];

    const supabase = createClient();
    const context: ToolContext = {
      supabase,
      get currentUser() {
        return currentUserRef.current!;
      },
      navigate: (href) => routerRef.current.push(href),
      requestConfirmation: (request) => requestConfirmationRef.current(request),
      onlineUserIds: () => useActiveList.getState().members,
      subscribeToInbox: (listener) => subscribeToInboxRef.current(listener),
      isInboxLive: () => isInboxLiveRef.current(),
    };

    return createWebmcpTools(context, (event) => logEventRef.current(event));
  }, [currentUserId]);

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
