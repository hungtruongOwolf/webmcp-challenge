import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

export const createGroup: ToolFactory = (ctx) => ({
  name: "create_group",
  description: "Create a new named group chat with two or more other people.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name for the group.",
      },
      member_ids: {
        type: "array",
        items: { type: "string" },
        description: "Ids of at least two other people to add, from search_people.",
      },
    },
    required: ["name", "member_ids"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const name = String(input.name || "").trim();
    const memberIds = Array.isArray(input.member_ids) ? input.member_ids.map(String) : [];

    if (!name) return errorResult("name is required.");
    if (memberIds.length < 2) return errorResult("member_ids needs at least two other people.");

    const { data: conversationId, error } = await ctx.supabase.rpc("create_conversation", {
      p_member_ids: memberIds,
      p_is_group: true,
      p_name: name,
    });

    if (error || !conversationId) {
      return errorResult(`Could not create the group: ${error?.message || "unknown error"}`);
    }

    ctx.navigate(`/conversations/${conversationId}`);

    return textResult(`Created group "${name}" (id: ${conversationId}).`);
  },
});
