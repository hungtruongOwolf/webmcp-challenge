import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";
import { REACTION_EMOJI, reactionLabel, reactionOptionsList } from "@/lib/webmcp/reactions";

export const reactToMessage: ToolFactory = (ctx) => ({
  name: "react_to_message",
  description:
    "React to a message with an emoji, or remove your reaction by sending the same emoji " +
    `again. Allowed reactions: ${reactionOptionsList()}. Pass message_id when you already ` +
    "have one from read_conversation. For \"react to the last message\", pass conversation_id " +
    "instead and leave message_id out -- it reacts to that conversation's most recent message.",
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "The message id from read_conversation. Omit to target the last message.",
      },
      conversation_id: {
        type: "string",
        description: "Required if message_id is omitted: reacts to its most recent message.",
      },
      emoji: {
        type: "string",
        enum: [...REACTION_EMOJI],
        description: "One of the allowed reaction emoji.",
      },
    },
    required: ["emoji"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, untrustedContentHint: true },
  execute: async (input) => {
    let messageId = String(input.message_id || "");
    const conversationId = String(input.conversation_id || "");
    const emoji = String(input.emoji || "");

    if (!REACTION_EMOJI.includes(emoji)) {
      return errorResult(`emoji must be one of: ${reactionOptionsList()}`);
    }
    if (!messageId && !conversationId) {
      return errorResult("Pass message_id, or conversation_id to react to its last message.");
    }

    let targetPreview = "";

    if (!messageId) {
      // "The last message" means the last one still visible: a soft-deleted
      // row has no body and nothing a person could be reacting to.
      const { data: latest, error: latestError } = await ctx.supabase
        .from("messages")
        .select("id, body, image, file_url")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) return errorResult(`Could not find the last message: ${latestError.message}`);
      if (!latest) return errorResult("That conversation has no messages yet.");

      messageId = latest.id;
      targetPreview = latest.image
        ? "the shared image"
        : latest.file_url
          ? "the shared file"
          : wrapUntrusted(`"${latest.body}"`);
    } else {
      const { data: target, error: targetError } = await ctx.supabase
        .from("messages")
        .select("id, deleted_at")
        .eq("id", messageId)
        .maybeSingle();

      if (targetError) return errorResult(`Could not find that message: ${targetError.message}`);
      if (!target) return errorResult("That message could not be found.");
      if (target.deleted_at) return errorResult("That message was deleted, so it cannot be reacted to.");
    }

    const { data: existing, error: readError } = await ctx.supabase
      .from("message_reactions")
      .select("emoji")
      .eq("message_id", messageId)
      .eq("user_id", ctx.currentUser.id)
      .maybeSingle();

    if (readError) return errorResult(`Could not check the existing reaction: ${readError.message}`);

    const targetNote = targetPreview ? ` (${targetPreview})` : "";

    if (existing?.emoji === emoji) {
      const { error } = await ctx.supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", ctx.currentUser.id);

      if (error) return errorResult(`Could not remove the reaction: ${error.message}`);
      return textResult(`Removed your ${reactionLabel(emoji)} reaction${targetNote}.`);
    }

    const { error } = await ctx.supabase
      .from("message_reactions")
      .upsert(
        { message_id: messageId, user_id: ctx.currentUser.id, emoji },
        { onConflict: "message_id,user_id" }
      );

    if (error) return errorResult(`Could not react to the message: ${error.message}`);
    return textResult(`Reacted with ${reactionLabel(emoji)}${targetNote}.`);
  },
});
