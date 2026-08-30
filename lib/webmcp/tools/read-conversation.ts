import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted, relativeTime } from "@/lib/webmcp/budget";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;

export const readConversation: ToolFactory = (ctx) => ({
  name: "read_conversation",
  description:
    "Read recent messages, oldest first, and marks them seen. Images show as a URL -- " +
    "ask the user before calling describe_image on one.",
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

    const { data, error } = await ctx.supabase
      .from("messages")
      .select("body, image, created_at, sender:profiles!messages_sender_id_fkey (name)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return errorResult(`Could not read conversation: ${error.message}`);
    if (!data || data.length === 0) return textResult("No messages yet in this conversation.");

    fetch(`/api/conversations/${conversationId}/seen`, { method: "POST" }).catch(() => {});

    const ordered = [...data].reverse();
    const lines = ordered.map((m: any) => {
      const who = m.sender?.name || "Unknown";
      const when = relativeTime(m.created_at);
      const body = m.image ? `[shared an image: ${m.image}]` : m.body || "";

      return `${who} (${when}): ${wrapUntrusted(body)}`;
    });

    return textResult(lines.join("\n"));
  },
});
