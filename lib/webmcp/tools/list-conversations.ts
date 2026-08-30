import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, relativeTime } from "@/lib/webmcp/budget";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;

export const listConversations: ToolFactory = (ctx) => ({
  name: "list_conversations",
  description:
    "List your conversations, newest activity first, with a title and a preview of the last message.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Max conversations to return (default 15, max 30).",
      },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const limit = Math.min(
      Math.max(Number(input.limit) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    const { data, error } = await ctx.supabase
      .from("conversations")
      .select(
        `id, name, is_group, last_message_at,
         members:conversation_members ( profile:profiles (*) ),
         messages ( body, image, created_at, sender_id )`
      )
      .order("last_message_at", { ascending: false })
      .limit(limit);

    if (error) return errorResult(`Could not list conversations: ${error.message}`);
    if (!data || data.length === 0) return textResult("No conversations yet.");

    const lines = data.map((c: any, i: number) => {
      const others = (c.members ?? [])
        .map((m: any) => m.profile)
        .filter((p: any) => p.id !== ctx.currentUser.id);
      const title = c.name || others[0]?.name || "Unknown";

      const msgs = [...(c.messages ?? [])].sort((a: any, b: any) =>
        a.created_at.localeCompare(b.created_at)
      );
      const last = msgs[msgs.length - 1];
      const preview = last ? (last.image ? "[image]" : last.body || "") : "Started a conversation";
      const when = last ? relativeTime(last.created_at) : relativeTime(c.last_message_at);

      return `${i + 1}. "${title}" (id: ${c.id}) -- ${preview} -- ${when}`;
    });

    return textResult(lines.join("\n"));
  },
});
