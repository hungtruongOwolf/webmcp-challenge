import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";
import {
  conversationTitle,
  findDirectConversation,
  loadConversationHead,
} from "@/lib/webmcp/conversations";

export const openConversation: ToolFactory = (ctx) => ({
  name: "open_conversation",
  description:
    "Open a conversation that already exists, by its conversation_id (from list_conversations) " +
    "or by the user_id of the other person in a 1:1 chat. Never creates anything -- if there " +
    "is no chat with that person yet, this fails and you should call start_conversation instead.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id, from list_conversations. Works for groups and 1:1 chats.",
      },
      user_id: {
        type: "string",
        description: "The other person's id, from search_people or list_people, to open your 1:1 chat with them.",
      },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    const userId = String(input.user_id || "");

    if (!conversationId && !userId) {
      return errorResult("Pass conversation_id (from list_conversations) or user_id (for a 1:1 chat).");
    }

    try {
      const conversation = conversationId
        ? await loadConversationHead(ctx.supabase, conversationId)
        : await findDirectConversation(ctx.supabase, userId);

      if (!conversation && !conversationId) {
        return errorResult(
          "You don't have a chat with that person yet. Call start_conversation with the " +
            "same user_id to create one and open it."
        );
      }
      if (!conversation) {
        return errorResult(
          "No conversation with that id that you're a member of. Use list_conversations to " +
            "find the right id, or start_conversation to create a new chat."
        );
      }

      ctx.navigate(`/conversations/${conversation.id}`);

      const title = wrapUntrusted(conversationTitle(conversation, ctx.currentUser.id));
      return textResult(
        `Opened ${title} (id: ${conversation.id}). Call send_message with this id and a text to reply.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Could not open the conversation: ${message}`);
    }
  },
});
