import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

/**
 * Deliberately does NOT gate on ctx.requestConfirmation() -- that pops the
 * app's own in-page dialog, and a voice/chat session has nobody watching
 * the browser tab to click it, so the call just hangs until the agent's own
 * tool-call timeout kills it. Same fix as send_message: the confirmation is
 * a second, explicit tool call (confirm: true) instead of a UI dialog
 * nothing is rendering.
 */
export const deleteConversation: ToolFactory = (ctx) => ({
  name: "delete_conversation",
  description:
    "Leave a conversation. If others are still in it, only removes it for you -- they keep " +
    "everything. If you're the last person in it, it's permanently deleted. Call once to see " +
    "what will happen, then call again with confirm: true once the user agrees.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id, from list_conversations.",
      },
      confirm: {
        type: "boolean",
        description: "Set true only after the user has explicitly agreed.",
      },
    },
    required: ["conversation_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    if (!conversationId) return errorResult("conversation_id is required.");

    const { data: members } = await ctx.supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId);

    const isLastMember = (members?.length ?? 0) <= 1;
    const impact = isLastMember
      ? "This is the last membership on it, so it will be permanently deleted for good."
      : "Other people are still in it, so this only removes it from your list -- they keep it.";

    if (input.confirm !== true) {
      return textResult(
        `Ask the user to confirm before leaving this conversation. ${impact} Call ` +
          "delete_conversation again with confirm: true once they agree."
      );
    }

    const res = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
    if (!res.ok) return errorResult(`Could not leave the conversation (status ${res.status}).`);

    const { fullyDeleted } = await res.json();

    ctx.navigate("/conversations");

    return textResult(
      fullyDeleted ? "Conversation permanently deleted." : "Left the conversation."
    );
  },
});
