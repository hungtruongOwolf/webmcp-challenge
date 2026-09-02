import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

/**
 * Same two-call confirm pattern as delete_conversation: a voice/chat session
 * has nobody watching the browser to click an in-page dialog, so confirmation
 * is a second explicit tool call (confirm: true) instead.
 */
export const deleteMessage: ToolFactory = (ctx) => ({
  name: "delete_message",
  description:
    "Unsend a message you sent -- permanently removes its content for everyone. Only works " +
    "on your own messages. Call once to see what will be deleted, then call again with " +
    "confirm: true once the user agrees.",
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "The message id, from read_conversation or search_messages.",
      },
      confirm: {
        type: "boolean",
        description: "Set true only after the user has explicitly agreed.",
      },
    },
    required: ["message_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const messageId = String(input.message_id || "");
    if (!messageId) return errorResult("message_id is required.");

    if (input.confirm !== true) {
      const { data: preview, error: previewError } = await ctx.supabase
        .from("messages")
        .select("body, image, file_url, sender_id, deleted_at")
        .eq("id", messageId)
        .maybeSingle();

      if (previewError) return errorResult(`Could not look up the message: ${previewError.message}`);
      if (!preview) return errorResult("Message not found.");
      if (preview.sender_id !== ctx.currentUser.id) {
        return errorResult("You can only delete your own messages.");
      }
      if (preview.deleted_at) return errorResult("That message is already deleted.");

      const what = preview.image
        ? "the shared image"
        : preview.file_url
          ? "the shared file"
          : `"${preview.body}"`;

      return textResult(
        wrapUntrusted(
          `Ask the user to confirm before deleting ${what} -- this can't be undone. Call ` +
            "delete_message again with confirm: true once they agree."
        )
      );
    }

    const { data, error } = await ctx.supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("sender_id", ctx.currentUser.id)
      .select("id")
      .maybeSingle();

    if (error) return errorResult(`Could not delete the message: ${error.message}`);
    if (!data) return errorResult("Message not found, or it isn't yours to delete.");

    return textResult("Message deleted.");
  },
});
