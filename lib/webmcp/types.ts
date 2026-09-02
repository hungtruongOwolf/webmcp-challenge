import type { User } from "@supabase/supabase-js";

import { createClient } from "@/app/libs/supabase/client";

export type SupabaseBrowserClient = ReturnType<typeof createClient>;

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel?: string;
};

/** Dependencies every tool's execute() gets, assembled once per registration pass. */
export type ToolContext = {
  supabase: SupabaseBrowserClient;
  currentUser: User;
  navigate: (href: string) => void;
  /** Opens the app's own confirm dialog and resolves once the user answers. */
  requestConfirmation: (request: ConfirmRequest) => Promise<boolean>;
  /** Ids currently tracked on the presence channel; the app's own online dots. */
  onlineUserIds: () => string[];
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
