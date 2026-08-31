import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

const REACTION_EMOJI = ["👍", "❤️", "😆", "😮", "😢", "😡"] as const;

export const reactToMessage: ToolFactory = (ctx) => ({
  name: "react_to_message",
  description:
    "React to a message with an emoji, or remove your reaction by sending the same emoji " +
    `again. Allowed emoji: ${REACTION_EMOJI.join(" ")}.`,
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "The message id from read_conversation.",
      },
      emoji: {
        type: "string",
        enum: [...REACTION_EMOJI],
        description: "One of the allowed reaction emoji.",
      },
    },
    required: ["message_id", "emoji"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const messageId = String(input.message_id || "");
    const emoji = String(input.emoji || "");

    if (!messageId) return errorResult("message_id is required.");
    if (!REACTION_EMOJI.includes(emoji as (typeof REACTION_EMOJI)[number])) {
      return errorResult(`emoji must be one of: ${REACTION_EMOJI.join(" ")}`);
    }

    const { data: existing, error: readError } = await ctx.supabase
      .from("message_reactions")
      .select("emoji")
      .eq("message_id", messageId)
      .eq("user_id", ctx.currentUser.id)
      .maybeSingle();

    if (readError) return errorResult(`Could not check the existing reaction: ${readError.message}`);

    if (existing?.emoji === emoji) {
      const { error } = await ctx.supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", ctx.currentUser.id);

      if (error) return errorResult(`Could not remove the reaction: ${error.message}`);
      return textResult(`Removed your ${emoji} reaction.`);
    }

    const { error } = await ctx.supabase
      .from("message_reactions")
      .upsert(
        { message_id: messageId, user_id: ctx.currentUser.id, emoji },
        { onConflict: "message_id,user_id" }
      );

    if (error) return errorResult(`Could not react to the message: ${error.message}`);
    return textResult(`Reacted with ${emoji}.`);
  },
});
