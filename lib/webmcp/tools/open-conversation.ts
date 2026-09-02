import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

export const openConversation: ToolFactory = (ctx) => ({
  name: "open_conversation",
  description:
    "Open an existing conversation, read-only -- never creates one. Pass conversation_id for " +
    "a specific chat (works for groups too), or user_id to look up an existing 1:1 by person. " +
    "If none exists yet for a 1:1, call start_conversation instead.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "A conversation id, from list_conversations. Works for groups too.",
      },
      user_id: {
        type: "string",
        description: "The other person's id, from search_people -- looks up an existing 1:1.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    const userId = String(input.user_id || "");

    if (!conversationId && !userId) {
      return errorResult("Pass conversation_id or user_id.");
    }

    if (conversationId) {
      const { data, error } = await ctx.supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();

      if (error) return errorResult(`Could not look up the conversation: ${error.message}`);
      if (!data) return errorResult("No conversation found with that id.");

      ctx.navigate(`/conversations/${data.id}`);
      return textResult(
        `Opened (id: ${data.id}). To send a message, call draft_message then send_message with this id.`
      );
    }

    // Mirrors create_conversation()'s own direct_key derivation (least/greatest
    // of the two member ids) so this stays a pure lookup with no write path.
    const directKey = [ctx.currentUser.id, userId].sort().join(":");

    const { data, error } = await ctx.supabase
      .from("conversations")
      .select("id")
      .eq("direct_key", directKey)
      .maybeSingle();

    if (error) return errorResult(`Could not look up the conversation: ${error.message}`);
    if (!data) {
      return textResult(
        "No existing chat with this person. Call start_conversation to create one."
      );
    }

    ctx.navigate(`/conversations/${data.id}`);

    return textResult(
      `Opened (id: ${data.id}). To send a message, call draft_message then send_message with this id.`
    );
  },
});
