import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";
import { readErrorDetail } from "@/lib/webmcp/http";

/**
 * Same two-call confirmation as delete_conversation: an in-page dialog has
 * nobody to click it in a voice session, so the agent asks and then calls
 * again with confirm: true.
 */
export const deleteMessage: ToolFactory = (ctx) => ({
  name: "delete_message",
  description:
    "Delete a message you sent. Everyone then sees a short 'message deleted' placeholder in " +
    "its place. Only the author can delete. Call once to hear what would be deleted, then " +
    "call again with confirm: true once the user agrees.",
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "The message id from read_conversation.",
      },
      confirm: {
        type: "boolean",
        description: "Set true only after the user has explicitly agreed.",
      },
    },
    required: ["message_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, untrustedContentHint: true },
  execute: async (input) => {
    const messageId = String(input.message_id || "");
    if (!messageId) return errorResult("message_id is required.");

    if (input.confirm !== true) {
      const { data: message, error } = await ctx.supabase
        .from("messages")
        .select("id, body, image, file_name")
        .eq("id", messageId)
        .maybeSingle();

      if (error) return errorResult(`Could not look up that message: ${error.message}`);
      if (!message) return errorResult("No message with that id that you can read.");

      const preview = message.image
        ? "the shared image"
        : message.file_name
          ? `the shared file "${message.file_name}"`
          : `"${message.body}"`;
      return textResult(
        `Ask the user to confirm deleting this message: ${wrapUntrusted(preview)}. Call ` +
          "delete_message again with confirm: true once they agree."
      );
    }

    const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });

    if (!res.ok) {
      const detail = await readErrorDetail(res);
      return errorResult(`Could not delete the message (status ${res.status}). ${detail}`.trim());
    }

    return textResult("Deleted the message. It now shows as a placeholder for everyone.");
  },
});
