import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";
import { conversationTitle, loadConversationHead } from "@/lib/webmcp/conversations";
import { moveConfirmationPreview } from "@/lib/webmcp/cross-conversation";

export const forwardMessage: ToolFactory = (ctx) => ({
  name: "forward_message",
  description:
    "Forward an existing message -- its text and/or attachment -- into another conversation " +
    "you are in. Use send_attachment with message_id instead when only the attachment should " +
    "go, or when you want to add a caption. When the message comes from a different " +
    "conversation than the target, the first call only previews the move; call again with " +
    "confirm: true once the user agrees.",
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
      confirm: {
        type: "boolean",
        description:
          "Set true only after the user has explicitly agreed to move content out of a " +
          "different conversation.",
      },
    },
    required: ["message_id", "conversation_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, untrustedContentHint: true },
  execute: async (input) => {
    const messageId = String(input.message_id || "");
    const conversationId = String(input.conversation_id || "");

    if (!messageId) return errorResult("message_id is required.");
    if (!conversationId) return errorResult("conversation_id is required.");

    const conversation = await loadConversationHead(ctx.supabase, conversationId).catch(() => null);
    const title = wrapUntrusted(conversationTitle(conversation, ctx.currentUser.id));

    const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}/forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, confirm: input.confirm === true }),
    });

    if (!res.ok) {
      const preview = await moveConfirmationPreview(res, "forward_message", title);
      if (preview) return preview;
      const detail = (await res.text?.().catch(() => "")) || "";
      return errorResult(`Could not forward the message (status ${res.status}). ${detail}`.trim());
    }

    const result = (await res.json?.().catch(() => ({}))) as { source?: { name?: string } };
    const from = result?.source?.name ? ` from ${wrapUntrusted(result.source.name)}` : "";
    return textResult(`Forwarded the message${from} to ${title}.`);
  },
});
