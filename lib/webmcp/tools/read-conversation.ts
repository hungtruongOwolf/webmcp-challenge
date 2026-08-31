import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted, relativeTime } from "@/lib/webmcp/budget";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;

export const readConversation: ToolFactory = (ctx) => ({
  name: "read_conversation",
  description:
    "Read messages, oldest first, and marks them seen. Images/files show as a URL -- ask " +
    "before calling describe_image. Pass `before` (a timestamp from the oldest message " +
    "returned) to page further back in time.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id, from list_conversations.",
      },
      limit: {
        type: "integer",
        description: "Max messages to return (default 20, max 40).",
      },
      before: {
        type: "string",
        description: "ISO timestamp -- only messages older than this. For paging back.",
      },
    },
    required: ["conversation_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    if (!conversationId) return errorResult("conversation_id is required.");

    const limit = Math.min(
      Math.max(Number(input.limit) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );
    const before = input.before ? String(input.before) : null;

    let query = ctx.supabase
      .from("messages")
      .select(
        "body, image, file_url, file_name, created_at, sender:profiles!messages_sender_id_fkey (name)"
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) query = query.lt("created_at", before);

    const { data, error } = await query;

    if (error) return errorResult(`Could not read conversation: ${error.message}`);
    if (!data || data.length === 0) {
      return textResult(
        before ? "No older messages." : "No messages yet in this conversation."
      );
    }

    if (!before) {
      fetch(`/api/conversations/${conversationId}/seen`, { method: "POST" }).catch(() => {});
    }

    const ordered = [...data].reverse();
    const lines = ordered.map((m: any) => {
      const who = m.sender?.name || "Unknown";
      const when = relativeTime(m.created_at);
      const body = m.image
        ? `[shared an image: ${m.image}]`
        : m.file_url
          ? `[shared a file "${m.file_name}": ${m.file_url}]`
          : m.body || "";

      return `${who} (${when}): ${wrapUntrusted(body)}`;
    });

    const oldest = data[data.length - 1]?.created_at;
    const hint = oldest ? `\n(pass before="${oldest}" to read further back)` : "";

    return textResult(lines.join("\n") + hint);
  },
});
