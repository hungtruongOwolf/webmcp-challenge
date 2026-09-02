"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";

import { useCurrentUser } from "@/app/context/current-user-context";
import { createClient } from "@/app/libs/supabase/client";

import { getWebMCPModelContext } from "./browser-api";
import type { WebMCPModelContext } from "./browser-api";
import type { WebMCPTool } from "./browser-api";
import {
  connectionMessage,
  connectionReducer,
  initialConnectionState,
  SIGN_IN_GUIDANCE,
} from "./connection-state";
import type {
  ConnectionEvent,
  ConnectionSnapshot,
  ConnectionState,
} from "./connection-state";
import { createToolApiClient } from "./tool-api-client";
import { defaultToolRegistry } from "./tool-registry";
import type { WebMCPToolRegistry } from "./tool-registry";

export type WebMCPConnectionContextValue = {
  state: ConnectionState;
  message: string;
  announce: (message: string) => void;
  beginAuthentication: () => void;
  returnToSignedOut: (message: string) => void;
  reportSessionExpired: () => void;
  retryConnection: () => void;
  replaceAuthenticatedTools: (tools: WebMCPTool[]) => void;
};

export type WebMCPConnectionProviderProps = PropsWithChildren<{
  modelContext?: WebMCPModelContext | null;
  currentUserId?: string | null;
  registry?: WebMCPToolRegistry;
  clearSession?: () => Promise<void>;
}>;

const WebMCPConnectionContext =
  createContext<WebMCPConnectionContextValue | null>(null);

const clearLocalSession = async (): Promise<void> => {
  await createClient().auth.signOut({ scope: "local" });
};

const snapshotFor = (
  state: ConnectionState,
  route: string
): ConnectionSnapshot => ({
  authenticated: state.userId !== null,
  state: state.status,
  route,
  nextAction: state.userId === null ? "sign_in_on_page" : "none",
  guidance: state.userId === null ? SIGN_IN_GUIDANCE : null,
});

export const WebMCPConnectionProvider = ({
  children,
  modelContext: suppliedModelContext,
  currentUserId: suppliedCurrentUserId,
  registry = defaultToolRegistry,
  clearSession = clearLocalSession,
}: WebMCPConnectionProviderProps) => {
  const currentUser = useCurrentUser();
  const pathname = usePathname();
  const currentUserId =
    suppliedCurrentUserId === undefined
      ? currentUser?.id ?? null
      : suppliedCurrentUserId;
  // Resolved once: re-reading document.modelContext on every render would
  // make the registration effect depend on whatever object the host hands
  // back, and a host that returns a fresh wrapper per access would then
  // re-register the whole scope on every navigation.
  const [discoveredModelContext] = useState(() =>
    suppliedModelContext === undefined ? getWebMCPModelContext() : null
  );
  const modelContext =
    suppliedModelContext === undefined
      ? discoveredModelContext
      : suppliedModelContext;
  const initialState: ConnectionState =
    currentUserId === null
      ? initialConnectionState
      : { status: "SESSION_READY", userId: currentUserId };
  const [state, dispatch] = useReducer(connectionReducer, initialState);
  const [message, setMessage] = useState(() => connectionMessage(initialState));
  const [registrationAttempt, setRegistrationAttempt] = useState(0);
  // Registration is keyed on tool NAMES, not on the array the catalog hands
  // over: a rebuilt array with the same names must not abort and re-register
  // (the agent's handles to the old registrations would go stale mid-task).
  // The signature is a string so a clear-then-install pair inside one commit
  // lands on an equal value and React skips the re-render entirely. The ref
  // always holds the newest handlers and the registered wrappers dispatch
  // through it, so a rebuilt catalog still runs the latest code.
  const [authenticatedToolSignature, setAuthenticatedToolSignature] = useState("");
  const authenticatedToolsRef = useRef<Map<string, WebMCPTool>>(new Map());
  const stateRef = useRef(state);
  const pathnameRef = useRef(pathname);
  const snapshotRef = useRef<ConnectionSnapshot>(
    snapshotFor(initialState, pathname)
  );
  const generationRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const sessionExpiredRef = useRef(false);
  const expiredUserIdRef = useRef<string | null>(null);
  const signedOutAfterExpiryRef = useRef(false);

  stateRef.current = state;
  pathnameRef.current = pathname;
  snapshotRef.current = snapshotFor(state, pathname);

  const transition = useCallback((event: ConnectionEvent) => {
    const nextState = connectionReducer(stateRef.current, event);
    stateRef.current = nextState;
    snapshotRef.current = snapshotFor(nextState, pathnameRef.current);
    dispatch(event);
    setMessage(connectionMessage(nextState));
  }, []);

  const announce = useCallback((nextMessage: string) => {
    setMessage(nextMessage);
  }, []);

  const beginAuthentication = useCallback(() => {
    sessionExpiredRef.current = false;
    expiredUserIdRef.current = null;
    signedOutAfterExpiryRef.current = false;
    transition({ type: "AUTH_STARTED" });
  }, [transition]);

  const returnToSignedOut = useCallback(
    (nextMessage: string) => {
      sessionExpiredRef.current = false;
      expiredUserIdRef.current = null;
      signedOutAfterExpiryRef.current = false;
      transition({ type: "SIGNED_OUT" });
      setMessage(nextMessage);
    },
    [transition]
  );

  const reportSessionExpired = useCallback(() => {
    sessionExpiredRef.current = true;
    expiredUserIdRef.current = stateRef.current.userId;
    signedOutAfterExpiryRef.current = false;
    generationRef.current += 1;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    transition({ type: "SESSION_EXPIRED" });
    void clearSession().catch(() => undefined);
  }, [clearSession, transition]);

  const retryConnection = useCallback(() => {
    setRegistrationAttempt((attempt) => attempt + 1);
  }, []);

  const replaceAuthenticatedTools = useCallback((tools: WebMCPTool[]) => {
    authenticatedToolsRef.current = new Map(tools.map((tool) => [tool.name, tool]));
    setAuthenticatedToolSignature(tools.map((tool) => tool.name).join("\n"));
  }, []);

  useEffect(() => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const generation = ++generationRef.current;
    const isCurrent = () =>
      generationRef.current === generation && !controller.signal.aborted;
    const getSnapshot = () => snapshotRef.current;

    const registerScope = async () => {
      if (currentUserId === null) {
        if (sessionExpiredRef.current) {
          signedOutAfterExpiryRef.current = true;
        } else {
          transition({ type: "SIGNED_OUT" });
        }
        if (modelContext === null) return;

        try {
          await Promise.all(
            registry
              .getPublicTools({ getSnapshot })
              .map((tool) =>
                modelContext.registerTool(tool, { signal: controller.signal })
              )
          );
        } catch {
          if (isCurrent()) controller.abort();
        }
        return;
      }

      if (sessionExpiredRef.current) {
        const isNewValidatedUser =
          signedOutAfterExpiryRef.current ||
          currentUserId !== expiredUserIdRef.current;
        if (!isNewValidatedUser) return;
        sessionExpiredRef.current = false;
        expiredUserIdRef.current = null;
        signedOutAfterExpiryRef.current = false;
      }

      transition({ type: "SESSION_READY", userId: currentUserId });
      if (modelContext === null) {
        if (isCurrent()) {
          transition({ type: "TOOLS_UNAVAILABLE", userId: currentUserId });
        }
        return;
      }

      transition({ type: "TOOLS_REGISTERING", userId: currentUserId });
      const apiClient = createToolApiClient({
        signal: controller.signal,
        onAuthRequired: reportSessionExpired,
      });

      try {
        const registryTools = registry.getAuthenticatedTools({
          getSnapshot,
          apiClient,
        });
        const registryToolNames = new Set(
          registryTools.map((tool) => tool.name)
        );
        const catalogTools = Array.from(
          authenticatedToolsRef.current.values()
        ).filter((tool) => !registryToolNames.has(tool.name));
        const tools = [...registryTools, ...catalogTools].map((tool) => ({
          // Descriptions and schemas are static per name: a later catalog
          // with the same names only swaps the handlers, never this metadata.
          ...tool,
          execute: async (
            input: Record<string, unknown>,
            agent?: ModelContextAgent
          ) => {
            if (!isCurrent()) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "This Verb session is no longer active. Sign in on the page and try again.",
                  },
                ],
                isError: true,
              };
            }

            const live = registryToolNames.has(tool.name)
              ? tool
              : authenticatedToolsRef.current.get(tool.name) ?? tool;
            return live.execute(input, agent);
          },
        }));
        await Promise.all(
          tools.map((tool) =>
            modelContext.registerTool(tool, { signal: controller.signal })
          )
        );
        if (isCurrent()) {
          transition({ type: "TOOLS_CONNECTED", userId: currentUserId });
        }
      } catch {
        if (!isCurrent()) return;
        controller.abort();
        transition({ type: "TOOLS_FAILED", userId: currentUserId });
      }
    };

    void registerScope();

    return () => {
      controller.abort();
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
      if (generationRef.current === generation) {
        generationRef.current += 1;
      }
    };
  }, [
    currentUserId,
    authenticatedToolSignature,
    modelContext,
    registrationAttempt,
    registry,
    reportSessionExpired,
    transition,
  ]);

  const value = useMemo<WebMCPConnectionContextValue>(
    () => ({
      state,
      message,
      announce,
      beginAuthentication,
      returnToSignedOut,
      reportSessionExpired,
      retryConnection,
      replaceAuthenticatedTools,
    }),
    [
      announce,
      beginAuthentication,
      message,
      reportSessionExpired,
      retryConnection,
      replaceAuthenticatedTools,
      returnToSignedOut,
      state,
    ]
  );

  return (
    <WebMCPConnectionContext.Provider value={value}>
      {children}
    </WebMCPConnectionContext.Provider>
  );
};

export const useWebMCPConnection = (): WebMCPConnectionContextValue => {
  const context = useContext(WebMCPConnectionContext);
  if (context === null) {
    throw new Error(
      "useWebMCPConnection must be used within WebMCPConnectionProvider."
    );
  }
  return context;
};
