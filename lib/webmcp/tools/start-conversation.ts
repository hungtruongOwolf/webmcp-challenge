import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

export const startConversation: ToolFactory = (ctx) => ({
  name: "start_conversation",
  description:
    "Start a new private 1:1 chat with someone you've never messaged before. If a chat with " +
    "them already exists, call open_conversation instead -- that one is read-only.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: {
        type: "string",
        description: "The other person's id, from search_people.",
      },
    },
    required: ["user_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const userId = String(input.user_id || "");
    if (!userId) return errorResult("user_id is required.");

    const { data: conversationId, error } = await ctx.supabase.rpc("create_conversation", {
      p_member_ids: [userId],
      p_is_group: false,
    });

    if (error || !conversationId) {
      return errorResult(`Could not start the conversation: ${error?.message || "unknown error"}`);
    }

    ctx.navigate(`/conversations/${conversationId}`);

    return textResult(
      `Started (id: ${conversationId}). To send a message, call draft_message then send_message with this id.`
    );
  },
});
