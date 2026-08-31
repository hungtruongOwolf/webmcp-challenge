import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

export const summarizeConversation: ToolFactory = (ctx) => ({
  name: "summarize_conversation",
  description:
    "Summarize a conversation as one coherent story, combining everything -- already-read " +
    "and unread messages alike -- instead of just the most recent ones read_conversation " +
    "returns. Use for 'catch me up' or 'what's this chat been about'.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id, from list_conversations.",
      },
      since: {
        type: "string",
        description: "ISO timestamp -- only summarize messages from this point on. Omit for the whole conversation.",
      },
    },
    required: ["conversation_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    if (!conversationId) return errorResult("conversation_id is required.");

    const since = input.since ? String(input.since) : undefined;

    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, since }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return errorResult(`Could not summarize the conversation (status ${res.status}). ${detail}`.trim());
    }

    const { summary, messageCount, truncated } = await res.json();
    const note = truncated
      ? ` (covers the most recent ${messageCount} messages -- ask again with a later "since" for a shorter, more complete summary)`
      : "";

    return textResult(wrapUntrusted(`${summary}${note}`));
  },
});
