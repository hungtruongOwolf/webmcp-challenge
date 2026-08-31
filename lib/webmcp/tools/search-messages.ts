import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted, relativeTime } from "@/lib/webmcp/budget";

const MAX_RESULTS = 20;

export const searchMessages: ToolFactory = (ctx) => ({
  name: "search_messages",
  description:
    "Find messages containing a word or phrase in one conversation, optionally within a " +
    "date range. Use this instead of read_conversation for 'find the message about X'.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id, from list_conversations.",
      },
      query: {
        type: "string",
        description: "Word or phrase to search for in the message text.",
      },
      after: {
        type: "string",
        description: "ISO timestamp -- only messages at or after this time.",
      },
      before: {
        type: "string",
        description: "ISO timestamp -- only messages before this time.",
      },
    },
    required: ["conversation_id", "query"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    const query = String(input.query || "").trim();
    if (!conversationId) return errorResult("conversation_id is required.");
    if (!query) return errorResult("query is required.");

    let dbQuery = ctx.supabase
      .from("messages")
      .select("body, created_at, sender:profiles!messages_sender_id_fkey (name)")
      .eq("conversation_id", conversationId)
      .ilike("body", `%${query.replace(/[%_]/g, "")}%`)
      .order("created_at", { ascending: false })
      .limit(MAX_RESULTS);

    if (input.after) dbQuery = dbQuery.gte("created_at", String(input.after));
    if (input.before) dbQuery = dbQuery.lt("created_at", String(input.before));

    const { data, error } = await dbQuery;

    if (error) return errorResult(`Could not search: ${error.message}`);
    if (!data || data.length === 0) return textResult(`No messages match "${query}".`);

    const ordered = [...data].reverse();
    const lines = ordered.map(
      (m: any) =>
        `${m.sender?.name || "Unknown"} (${relativeTime(m.created_at)}): ${wrapUntrusted(m.body || "")}`
    );

    return textResult(lines.join("\n"));
  },
});
