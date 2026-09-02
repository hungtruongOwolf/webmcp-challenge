import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

export const draftMessage: ToolFactory = (ctx) => ({
  name: "draft_message",
  description:
    "Save a draft reply without sending it, so the user can hear and adjust the wording first. " +
    "Then call send_message without text to send it. For an ordinary reply the user has " +
    "already approved, skip this and call send_message with text directly.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id, from list_conversations.",
      },
      body: {
        type: "string",
        description: "The message text to save as a draft.",
      },
    },
    required: ["conversation_id", "body"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    const body = String(input.body || "").trim();

    if (!conversationId) return errorResult("conversation_id is required.");
    if (!body) return errorResult("body is required.");

    const { error } = await ctx.supabase.from("drafts").upsert(
      {
        conversation_id: conversationId,
        user_id: ctx.currentUser.id,
        body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" }
    );

    if (error) return errorResult(`Could not save the draft: ${error.message}`);

    return textResult(`Draft saved for this conversation: "${body}"`);
  },
});
