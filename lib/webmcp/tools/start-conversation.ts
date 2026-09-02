import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";
import { findDirectConversation } from "@/lib/webmcp/conversations";

export const startConversation: ToolFactory = (ctx) => ({
  name: "start_conversation",
  description:
    "Start a private 1:1 chat with one person and open it. If a chat with them already exists " +
    "it is opened instead of duplicated; the result says which with created: true/false. " +
    "To open a chat you already know exists, prefer open_conversation.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: {
        type: "string",
        description: "The other person's id, from search_people or list_people.",
      },
    },
    required: ["user_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const userId = String(input.user_id || "");
    if (!userId) return errorResult("user_id is required.");

    const { data: person, error: personError } = await ctx.supabase
      .from("profiles")
      .select("id, name, email")
      .eq("id", userId)
      .maybeSingle();

    if (personError) return errorResult(`Could not look up that person: ${personError.message}`);
    if (!person) return errorResult("No one has that user_id. Use search_people or list_people to find them.");

    const name = person.name || person.email || "them";

    try {
      const existing = await findDirectConversation(ctx.supabase, userId);
      if (existing) {
        ctx.navigate(`/conversations/${existing.id}`);
        return textResult(
          `You already had a chat with ${name}; opened it (id: ${existing.id}, created: false). ` +
            "Call send_message with this id and a text to say something."
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Could not check for an existing chat: ${message}`);
    }

    const { data: conversationId, error } = await ctx.supabase.rpc("create_conversation", {
      p_member_ids: [userId],
      p_is_group: false,
    });

    if (error || !conversationId) {
      return errorResult(`Could not start the conversation: ${error?.message || "unknown error"}`);
    }

    ctx.navigate(`/conversations/${conversationId}`);

    return textResult(
      `Started a new chat with ${name} (id: ${conversationId}, created: true). ` +
        "Call send_message with this id and a text to say something."
    );
  },
});
