import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";
import { conversationTitle, loadConversationHead } from "@/lib/webmcp/conversations";

export const forwardMessage: ToolFactory = (ctx) => ({
  name: "forward_message",
  description:
    "Forward an existing message -- its text and/or attachment -- into another conversation " +
    "you are in. Use send_attachment with message_id instead when only the attachment should " +
    "go, or when you want to add a caption.",
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "The message id from read_conversation.",
      },
      conversation_id: {
        type: "string",
        description: "The conversation to forward it into, from list_conversations.",
      },
    },
    required: ["message_id", "conversation_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const messageId = String(input.message_id || "");
    const conversationId = String(input.conversation_id || "");

    if (!messageId) return errorResult("message_id is required.");
    if (!conversationId) return errorResult("conversation_id is required.");

    const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}/forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });

    if (!res.ok) {
      const detail = (await res.text?.().catch(() => "")) || "";
      return errorResult(`Could not forward the message (status ${res.status}). ${detail}`.trim());
    }

    const conversation = await loadConversationHead(ctx.supabase, conversationId).catch(() => null);
    const title = conversationTitle(conversation, ctx.currentUser.id);
    return textResult(`Forwarded the message to ${title}.`);
  },
});
