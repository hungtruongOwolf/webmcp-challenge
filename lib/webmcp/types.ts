import type { User } from "@supabase/supabase-js";

import { createClient } from "@/app/libs/supabase/client";

export type SupabaseBrowserClient = ReturnType<typeof createClient>;

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel?: string;
};

/** One broadcast on the user:<uuid> inbox topic, as the sidebar triggers send it. */
export type InboxBroadcast = {
  table?: string;
  operation?: string;
  record?: unknown;
  old_record?: unknown;
};

export type InboxEvent =
  | { type: "broadcast"; payload: InboxBroadcast }
  | { type: "status"; live: boolean };

export type InboxListener = (event: InboxEvent) => void;

/** Dependencies every tool's execute() gets, assembled once per registration pass. */
export type ToolContext = {
  supabase: SupabaseBrowserClient;
  currentUser: User;
  navigate: (href: string) => void;
  /** Opens the app's own confirm dialog and resolves once the user answers. */
  requestConfirmation: (request: ConfirmRequest) => Promise<boolean>;
  /** Ids currently tracked on the presence channel; the app's own online dots. */
  onlineUserIds: () => string[];
  /**
   * Taps the sidebar's inbox channel. realtime-js returns the existing channel
   * for a topic, so a tool must never open its own on user:<uuid>; it would
   * share the sidebar's and tear it down on cleanup. Returns an unsubscribe.
   */
  subscribeToInbox: (listener: InboxListener) => () => void;
  /** Whether that channel is currently joined; false means fall back to polling. */
  isInboxLive: () => boolean;
};

export type ToolStatus = "success" | "error" | "cancelled";

/** One row in the Tool Activity Panel -- registration or invocation. */
export type ToolActivityEvent = {
  id: string;
  at: number;
  kind: "registered" | "call";
  toolName: string;
  summary: string;
  status?: ToolStatus;
};

export type ToolFactory = (ctx: ToolContext) => ModelContextTool;
