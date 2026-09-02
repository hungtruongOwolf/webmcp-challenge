import type { ToolContext, ToolFactory } from "@/lib/webmcp/types";
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
  ctx: ToolContext;
  conversationId: string | null;
  timeoutMs: number;
};

const isIncoming = (value: unknown): value is IncomingMessage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as IncomingMessage).id === "string" &&
  typeof (value as IncomingMessage).created_at === "string";

/** Newest messages from other people, newest first. */
async function fetchRecent(options: WaitOptions): Promise<IncomingMessage[]> {
  let query = options.ctx.supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, image, file_name, created_at")
    .neq("sender_id", options.ctx.currentUser.id)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);

  if (options.conversationId) query = query.eq("conversation_id", options.conversationId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as IncomingMessage[];
}

/**
 * Listens through the sidebar's inbox feed (the user:<uuid> broadcast the
 * ConversationsProvider already holds) and resolves on the first message from
 * someone else. Opening a second channel on that topic is not an option:
 * realtime-js would hand back the sidebar's channel, and removing it on the
 * way out would silence the "New message from ..." announcements until
 * reload. When the provider reports the channel is not live (blocked proxy,
 * failed join), the tool polls instead.
 *
 * "New" is decided by id, not by created_at: the client clock can run ahead
 * of Postgres, and the two format timestamps differently, so a string or
 * Date comparison against a local "since" can silently drop a real reply.
 */
function waitForIncoming(options: WaitOptions): Promise<IncomingMessage[] | null> {
  const { ctx, conversationId, timeoutMs } = options;
  const userId = ctx.currentUser.id;

  return new Promise((resolve) => {
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    let seenAtStart: Set<string> | null = null;
    let snapshot: Promise<void> | null = null;

    const finish = (messages: IncomingMessage[] | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (pollTimer) clearTimeout(pollTimer);
      unsubscribe();
      resolve(messages);
    };

    const accept = (record: IncomingMessage) =>
      record.sender_id !== userId &&
      (!conversationId || record.conversation_id === conversationId);

    // One snapshot at a time: a slow first query must not be doubled by the
    // poll tick, or two "existing" sets race to define what counts as new.
    const snapshotExisting = () => {
      if (!snapshot) {
        snapshot = fetchRecent(options)
          .then((rows) => {
            seenAtStart = new Set(rows.map((m) => m.id));
          })
          .catch(() => {
            // The next poll tick retries; a broadcast never needs the snapshot.
          })
          .finally(() => {
            snapshot = null;
          });
      }
      return snapshot;
    };

    const pollOnce = async () => {
      if (snapshot) return;
      if (seenAtStart === null) {
        await snapshotExisting();
        return;
      }
      const known = seenAtStart;
      try {
        const found = (await fetchRecent(options)).filter((m) => !known.has(m.id) && accept(m));
        if (found.length > 0) finish(found.reverse());
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

    const unsubscribe = ctx.subscribeToInbox((event) => {
      if (event.type === "status") {
        if (!event.live) startPolling();
        return;
      }
      const { payload } = event;
      // Edits, deletions, and the read-receipt re-broadcast all carry an
      // old_record; only a genuine insert is a new message.
      if (payload.table !== "messages" || !isIncoming(payload.record)) return;
      if (payload.operation !== "INSERT" || payload.old_record) return;
      if (accept(payload.record)) finish([payload.record]);
    });

    // Taken even while live, so a mid-wait fallback to polling still measures
    // "new" from the moment the call started.
    void snapshotExisting();
    if (!ctx.isInboxLive()) startPolling();
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
      ctx,
      conversationId,
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
      const name = wrapUntrusted(names.get(m.sender_id) || "Unknown");
      return `${name} (conversation ${m.conversation_id}): ${wrapUntrusted(body)}`;
    });

    return textResult(`timedOut: false. ${messages.length} new message(s):\n` + lines.join("\n"));
  },
});
