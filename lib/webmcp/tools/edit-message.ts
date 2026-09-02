import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

export const editMessage: ToolFactory = () => ({
  name: "edit_message",
  description:
    "Replace the text of a message you sent. Only the author can edit, and the message then " +
    "shows as edited to everyone. Use delete_message to take a message back entirely.",
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "The message id from read_conversation.",
      },
      text: {
        type: "string",
        description: "The new message text.",
      },
    },
    required: ["message_id", "text"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const messageId = String(input.message_id || "");
    const text = String(input.text || "").trim();

    if (!messageId) return errorResult("message_id is required.");
    if (!text) return errorResult("text is required.");

    const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });

    if (!res.ok) {
      const detail = (await res.text?.().catch(() => "")) || "";
      return errorResult(`Could not edit the message (status ${res.status}). ${detail}`.trim());
    }

    return textResult(`Edited the message to: "${text}". It now shows as edited.`);
  },
});
