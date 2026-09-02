import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

export const openConversation: ToolFactory = (ctx) => ({
  name: "open_conversation",
  description:
    "Open an existing private 1:1 chat with one person. Read-only -- never creates one. If " +
    "none exists yet, call start_conversation instead.",
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
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const userId = String(input.user_id || "");
    if (!userId) return errorResult("user_id is required.");

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
