import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createGroup: ToolFactory = (ctx) => ({
  name: "create_group",
  description:
    "Create a new named group chat with two or more other people. Members can be given as " +
    "ids from search_people, or as plain names/emails -- each one is resolved automatically, " +
    "so you don't have to search_people for every person first.",
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
        description: "At least two other people: ids from search_people, or name/email text.",
      },
    },
    required: ["name", "member_ids"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const name = String(input.name || "").trim();
    const rawMembers = Array.isArray(input.member_ids) ? input.member_ids.map(String) : [];

    if (!name) return errorResult("name is required.");
    if (rawMembers.length < 2) return errorResult("member_ids needs at least two other people.");

    const memberIds: string[] = [];

    for (const raw of rawMembers) {
      if (UUID_RE.test(raw)) {
        memberIds.push(raw);
        continue;
      }

      const { data: matches, error } = await ctx.supabase
        .from("profiles")
        .select("id, name, email")
        .neq("id", ctx.currentUser.id)
        .or(`name.ilike.%${raw}%,email.ilike.%${raw}%`)
        .limit(5);

      if (error) return errorResult(`Could not look up "${raw}": ${error.message}`);
      if (!matches || matches.length === 0) {
        return errorResult(`No one matches "${raw}". Try search_people to check the spelling.`);
      }
      if (matches.length > 1) {
        const options = matches.map((p) => `${p.name} (${p.email})`).join(", ");
        return errorResult(`"${raw}" matches more than one person: ${options}. Be more specific.`);
      }

      memberIds.push(matches[0].id);
    }

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
