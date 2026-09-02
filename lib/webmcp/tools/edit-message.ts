import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

export const editMessage: ToolFactory = (ctx) => ({
  name: "edit_message",
  description:
    "Change the text of a message you already sent. Only works on your own messages, and " +
    "only while they still have text (not an image/file, not already deleted).",
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "The message id, from read_conversation or search_messages.",
      },
      body: {
        type: "string",
        description: "The new text for the message.",
      },
    },
    required: ["message_id", "body"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const messageId = String(input.message_id || "");
    const body = String(input.body || "").trim();
    if (!messageId) return errorResult("message_id is required.");
    if (!body) return errorResult("body is required.");

    const { data, error } = await ctx.supabase
      .from("messages")
      .update({ body })
      .eq("id", messageId)
      .eq("sender_id", ctx.currentUser.id)
      .select("deleted_at")
      .maybeSingle();

    if (error) return errorResult(`Could not edit the message: ${error.message}`);
    if (!data) return errorResult("Message not found, or it isn't yours to edit.");
    if (data.deleted_at) {
      return errorResult("That message was deleted and can no longer be edited.");
    }

    return textResult(wrapUntrusted(`Edited to: "${body}"`));
  },
});
