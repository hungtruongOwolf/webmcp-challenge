import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

export const openConversation: ToolFactory = (ctx) => ({
  name: "open_conversation",
  description: "Open, or start if it doesn't exist yet, a private 1:1 chat with one person.",
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
      return errorResult(`Could not open the conversation: ${error?.message || "unknown error"}`);
    }

    ctx.navigate(`/conversations/${conversationId}`);

    return textResult(`Opened conversation ${conversationId}.`);
  },
});
