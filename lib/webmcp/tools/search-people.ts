import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

export const searchPeople: ToolFactory = (ctx) => ({
  name: "search_people",
  description: "Search people by name or email to find someone to start a chat with.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Name or email fragment to search for.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const query = String(input.query || "").trim();
    if (!query) return errorResult("query is required.");

    const { data, error } = await ctx.supabase
      .from("profiles")
      .select("id, name, email")
      .neq("id", ctx.currentUser.id)
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10);

    if (error) return errorResult(`Could not search people: ${error.message}`);
    if (!data || data.length === 0) return textResult(`No one matches "${query}".`);

    const lines = data.map((p) => `${p.name} (id: ${p.id}, ${p.email})`);
    return textResult(wrapUntrusted(lines.join("\n")));
  },
});
