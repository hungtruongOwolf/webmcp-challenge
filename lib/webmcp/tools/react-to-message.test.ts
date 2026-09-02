import { describe, expect, it } from "vitest";

import { wrapUntrusted } from "@/lib/webmcp/budget";
import { REACTION_EMOJI, reactionLabel } from "@/lib/webmcp/reactions";

import { reactToMessage } from "./react-to-message";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

const emoji = REACTION_EMOJI[0];

describe("react_to_message", () => {
  it("refuses to react to a deleted message", async () => {
    const fake = createFakeSupabase({
      results: {
        messages: [{ data: { id: "m1", body: null, deleted_at: "2026-09-02T09:05:00.000Z" } }],
      },
    });
    const { ctx } = createFakeContext(fake.client);

    const result = await reactToMessage(ctx).execute({ message_id: "m1", emoji });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/deleted/);
    expect(resultText(result)).not.toContain("null");
    expect(fake.queries.filter((q) => q.table === "message_reactions")).toHaveLength(0);
  });

  it("reports a message id that does not exist", async () => {
    const fake = createFakeSupabase({ results: { messages: [{ data: null }] } });
    const { ctx } = createFakeContext(fake.client);

    const result = await reactToMessage(ctx).execute({ message_id: "ghost", emoji });

    expect(result.isError).toBe(true);
    expect(fake.queries.filter((q) => q.table === "message_reactions")).toHaveLength(0);
  });

  it("targets the latest message that is not deleted when given a conversation", async () => {
    const fake = createFakeSupabase({
      results: {
        messages: [{ data: { id: "m2", body: "hi", image: null, file_url: null, deleted_at: null } }],
        message_reactions: [{ data: null }, { data: null }],
      },
    });
    const { ctx } = createFakeContext(fake.client);
    const tool = reactToMessage(ctx);

    const result = await tool.execute({ conversation_id: "conv-1", emoji });

    expect(result.isError).toBeUndefined();
    // The echoed body was written by someone else, so it carries the untrusted marker.
    expect(tool.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: true });
    expect(resultText(result)).toBe(`Reacted with ${reactionLabel(emoji)} (${wrapUntrusted('"hi"')}).`);
    expect(fake.opsFor("messages")).toContainEqual(["is", ["deleted_at", null]]);
    expect(fake.opsFor("message_reactions", 1)).toContainEqual([
      "upsert",
      [{ message_id: "m2", user_id: "me-id", emoji }, { onConflict: "message_id,user_id" }],
    ]);
  });
});
