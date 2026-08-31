import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";
import { STICKER_EMOJI, stickerOptionsList } from "@/lib/webmcp/stickers";

export const sendSticker: ToolFactory = (ctx) => ({
  name: "send_sticker",
  description:
    "Send a big stand-alone emoji as its own message -- not a reply, not a reaction to an " +
    `existing message. Allowed stickers: ${stickerOptionsList()}.`,
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id, from list_conversations.",
      },
      emoji: {
        type: "string",
        enum: [...STICKER_EMOJI],
        description: "One of the allowed sticker emoji.",
      },
    },
    required: ["conversation_id", "emoji"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    const emoji = String(input.emoji || "");

    if (!conversationId) return errorResult("conversation_id is required.");
    if (!STICKER_EMOJI.includes(emoji)) {
      return errorResult(`emoji must be one of: ${stickerOptionsList()}`);
    }

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: emoji, conversationId }),
    });

    if (!res.ok) return errorResult(`Could not send the sticker (status ${res.status}).`);

    return textResult(`Sent ${emoji}.`);
  },
});
