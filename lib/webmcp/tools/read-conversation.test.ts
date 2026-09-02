import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REACTION_EMOJI, reactionLabel } from "@/lib/webmcp/reactions";

import { readConversation } from "./read-conversation";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

const emoji = REACTION_EMOJI[0];

const row = (overrides: Record<string, unknown>) => ({
  id: "m1",
  body: "hello",
  image: null,
  file_url: null,
  file_name: null,
  created_at: "2026-09-02T09:00:00.000Z",
  edited_at: null,
  deleted_at: null,
  sender: { name: "Grace" },
  reactions: [{ emoji, user: { name: "Me" } }],
  ...overrides,
});

beforeEach(() => {
  // The tool fires a seen-marker request; nothing here should depend on it.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null)));
});

afterEach(() => vi.unstubAllGlobals());

describe("read_conversation", () => {
  it("does not list reactions under a deleted message", async () => {
    const fake = createFakeSupabase({
      results: {
        messages: [
          {
            data: [
              row({ id: "m2", body: null, deleted_at: "2026-09-02T09:05:00.000Z" }),
              row({ id: "m1" }),
            ],
          },
        ],
      },
    });
    const { ctx } = createFakeContext(fake.client);

    const result = await readConversation(ctx).execute({ conversation_id: "conv-1" });
    const lines = resultText(result).split("\n");
    const live = lines.find((line) => line.includes("hello"));
    const deleted = lines.find((line) => line.includes("[message deleted]"));

    expect(result.isError).toBeUndefined();
    expect(live).toContain(`[reactions: ${reactionLabel(emoji)} from Me]`);
    expect(deleted).toBeDefined();
    expect(deleted).not.toContain("reactions");
  });
});
