"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

import type { ToolActivityEvent } from "@/lib/webmcp/types";

const MAX_EVENTS = 50;

type WebmcpActivityValue = {
  events: ToolActivityEvent[];
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  logEvent: (event: Omit<ToolActivityEvent, "id" | "at">) => void;
};

const WebmcpActivityContext = createContext<WebmcpActivityValue | null>(null);

export function WebmcpActivityProvider({ children }: PropsWithChildren) {
  const [events, setEvents] = useState<ToolActivityEvent[]>([]);
  const [enabled, setEnabled] = useState(false);

  const logEvent = useCallback((event: Omit<ToolActivityEvent, "id" | "at">) => {
    setEvents((current) => {
      const next: ToolActivityEvent = {
        ...event,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: Date.now(),
      };

      return [next, ...current].slice(0, MAX_EVENTS);
    });
  }, []);

  const value = useMemo(
    () => ({ events, enabled, setEnabled, logEvent }),
    [events, enabled, logEvent]
  );

  return (
    <WebmcpActivityContext.Provider value={value}>{children}</WebmcpActivityContext.Provider>
  );
}

export function useWebmcpActivity() {
  const ctx = useContext(WebmcpActivityContext);
  if (!ctx) throw new Error("useWebmcpActivity must be used within WebmcpActivityProvider");
  return ctx;
}
