import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

export const deleteConversation: ToolFactory = (ctx) => ({
  name: "delete_conversation",
  description:
    "Permanently delete a conversation for everyone in it. Asks the user to confirm first.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id, from list_conversations.",
      },
    },
    required: ["conversation_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    if (!conversationId) return errorResult("conversation_id is required.");

    const confirmed = await ctx.requestConfirmation({
      title: "Delete this chat?",
      body: "This removes the conversation for everyone in it. This can't be undone.",
      confirmLabel: "Delete",
    });

    if (!confirmed) return textResult("Cancelled -- the conversation was not deleted.");

    const res = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
    if (!res.ok) return errorResult(`Could not delete the conversation (status ${res.status}).`);

    ctx.navigate("/conversations");

    return textResult("Conversation deleted.");
  },
});
