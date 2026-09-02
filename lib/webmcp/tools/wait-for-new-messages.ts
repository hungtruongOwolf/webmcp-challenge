import type { ToolFactory, SupabaseBrowserClient } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 60;
const POLL_INTERVAL_MS = 2_000;
const MAX_MESSAGES = 10;

type IncomingMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  image: string | null;
  file_name: string | null;
  created_at: string;
};

type WaitOptions = {
  supabase: SupabaseBrowserClient;
  userId: string;
  conversationId: string | null;
  since: string;
  timeoutMs: number;
};

const isIncoming = (value: unknown): value is IncomingMessage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as IncomingMessage).id === "string" &&
  typeof (value as IncomingMessage).created_at === "string";

async function pollNewMessages(options: WaitOptions): Promise<IncomingMessage[]> {
  let query = options.supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, image, file_name, created_at")
    .gt("created_at", options.since)
    .neq("sender_id", options.userId)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES);

  if (options.conversationId) query = query.eq("conversation_id", options.conversationId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as IncomingMessage[];
}

/**
 * Listens on the caller's own inbox topic (the same user:<uuid> broadcast the
 * sidebar uses, fed by the on_message_sidebar_broadcast trigger) and resolves
 * on the first message from someone else. Realtime can be blocked by a
 * proxy or fail to join, so a channel error switches to polling; a catch-up
 * poll right after joining covers a message that landed in the gap between
 * the call starting and the subscription going live.
 */
function waitForIncoming(options: WaitOptions): Promise<IncomingMessage[] | null> {
  const { supabase, userId, conversationId, since, timeoutMs } = options;

  return new Promise((resolve) => {
    const channel = supabase.channel(`user:${userId}`, { config: { private: true } });
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const finish = (messages: IncomingMessage[] | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (pollTimer) clearTimeout(pollTimer);
      void supabase.removeChannel(channel);
      resolve(messages);
    };

    const accept = (record: IncomingMessage) =>
      record.sender_id !== userId &&
      record.created_at > since &&
      (!conversationId || record.conversation_id === conversationId);

    const pollOnce = async () => {
      try {
        const found = (await pollNewMessages(options)).filter(accept);
        if (found.length > 0) finish(found);
      } catch {
        // A failed poll is not fatal: the next tick or the timeout settles it.
      }
    };

    const startPolling = () => {
      if (pollTimer || settled) return;
      const tick = async () => {
        await pollOnce();
        if (!settled) pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
      };
      pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    const timeout = setTimeout(() => finish(null), timeoutMs);

    channel
      .on("broadcast", { event: "*" }, ({ payload }) => {
        // Edits, deletions, and the read-receipt re-broadcast all carry an
        // old_record; only a genuine insert is a new message.
        if (payload?.table !== "messages" || !isIncoming(payload.record)) return;
        if (payload.operation !== "INSERT" || payload.old_record) return;
        if (accept(payload.record)) finish([payload.record]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void pollOnce();
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPolling();
        }
      });
  });
}

export const waitForNewMessages: ToolFactory = (ctx) => ({
  name: "wait_for_new_messages",
  description:
    "Block until someone else sends a message, then return it -- for 'tell me when they " +
    "reply'. Waits across all conversations, or only one if conversation_id is given. Gives " +
    "up after timeout_seconds (default 30, max 60) with timedOut: true; call again to keep waiting.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Only wait for messages in this conversation. Omit to wait for any.",
      },
      timeout_seconds: {
        type: "integer",
        description: "How long to wait before giving up (default 30, max 60).",
      },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "") || null;
    const requested = Number(input.timeout_seconds);
    const timeoutSeconds = Math.min(
      Math.max(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_TIMEOUT_SECONDS, 1),
      MAX_TIMEOUT_SECONDS
    );

    const messages = await waitForIncoming({
      supabase: ctx.supabase,
      userId: ctx.currentUser.id,
      conversationId,
      since: new Date().toISOString(),
      timeoutMs: timeoutSeconds * 1000,
    });

    if (!messages) {
      return textResult(
        `timedOut: true. No new messages from anyone else in ${timeoutSeconds} seconds` +
          (conversationId ? " in that conversation." : ".") +
          " Call wait_for_new_messages again to keep waiting."
      );
    }

    const senderIds = Array.from(new Set(messages.map((m) => m.sender_id)));
    const { data: profiles, error } = await ctx.supabase
      .from("profiles")
      .select("id, name")
      .in("id", senderIds);

    if (error) return errorResult(`A message arrived but the sender could not be looked up: ${error.message}`);

    const names = new Map((profiles ?? []).map((p) => [p.id, p.name || "Unknown"]));
    const lines = messages.map((m) => {
      const body = m.image
        ? `[shared an image -- describe_image message_id="${m.id}"]`
        : m.file_name
          ? `[shared a file "${m.file_name}" -- read_file message_id="${m.id}"]`
          : m.body || "";
      return `${names.get(m.sender_id) || "Unknown"} (conversation ${m.conversation_id}): ${wrapUntrusted(body)}`;
    });

    return textResult(`timedOut: false. ${messages.length} new message(s):\n` + lines.join("\n"));
  },
});
