import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";
import { conversationTitle, loadConversationHead } from "@/lib/webmcp/conversations";

export const sendMessage: ToolFactory = (ctx) => ({
  name: "send_message",
  description:
    "Send a text message to a conversation. Pass `text` to write and send in one call -- the " +
    "normal way to reply. Leave `text` out to send the draft previously saved with draft_message " +
    "(the review-before-send flow, when the user wants to hear the wording first).",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id, from list_conversations or open_conversation.",
      },
      text: {
        type: "string",
        description: "The message to send. Omit to send the saved draft instead.",
      },
    },
    required: ["conversation_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    if (!conversationId) return errorResult("conversation_id is required.");

    const text = String(input.text || "").trim();
    let body = text;

    if (!body) {
      const { data: draft, error: draftError } = await ctx.supabase
        .from("drafts")
        .select("body")
        .eq("conversation_id", conversationId)
        .eq("user_id", ctx.currentUser.id)
        .maybeSingle();

      if (draftError) return errorResult(`Could not read the draft: ${draftError.message}`);
      if (!draft?.body) {
        return errorResult(
          "Nothing to send: pass text to send a message directly, or call draft_message first " +
            "and then send_message without text."
        );
      }
      body = draft.body;
    }

    const conversation = await loadConversationHead(ctx.supabase, conversationId).catch(() => null);
    const title = conversationTitle(conversation, ctx.currentUser.id);

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: body, conversationId }),
    });

    if (!res.ok) return errorResult(`Could not send the message (status ${res.status}).`);

    // Only the draft flow clears a draft, and only the exact body just sent:
    // a draft_message call landing between the read above and this delete
    // would otherwise get silently wiped instead of the message actually sent.
    if (!text) {
      await ctx.supabase
        .from("drafts")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", ctx.currentUser.id)
        .eq("body", body);
    }

    return textResult(wrapUntrusted(`Sent to ${title}: "${body}"`));
  },
});
