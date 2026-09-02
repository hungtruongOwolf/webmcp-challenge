import { describe, expect, it } from "vitest";

import { startConversation } from "./start-conversation";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

const maya = { id: "other-id", name: "Maya", email: "maya@example.org" };

describe("start_conversation", () => {
  it("creates a direct chat, opens it, and reports created: true", async () => {
    const fake = createFakeSupabase({
      results: {
        profiles: [{ data: maya }],
        conversations: [{ data: null }],
      },
      rpc: () => ({ data: "conv-new" }),
    });
    const { ctx, navigated } = createFakeContext(fake.client);

    const result = await startConversation(ctx).execute({ user_id: "other-id" });

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("created: true");
    expect(resultText(result)).toContain("conv-new");
    expect(fake.rpcCalls).toEqual([
      { name: "create_conversation", args: { p_member_ids: ["other-id"], p_is_group: false } },
    ]);
    expect(navigated).toEqual(["/conversations/conv-new"]);
  });

  it("reuses an existing direct chat and reports created: false", async () => {
    const fake = createFakeSupabase({
      results: {
        profiles: [{ data: maya }],
        conversations: [{ data: { id: "conv-1" } }],
      },
    });
    const { ctx, navigated } = createFakeContext(fake.client);

    const result = await startConversation(ctx).execute({ user_id: "other-id" });

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("created: false");
    expect(fake.rpcCalls).toEqual([]);
    expect(navigated).toEqual(["/conversations/conv-1"]);
  });

  it("rejects an unknown person before touching the database", async () => {
    const fake = createFakeSupabase({ results: { profiles: [{ data: null }] } });
    const { ctx, navigated } = createFakeContext(fake.client);

    const result = await startConversation(ctx).execute({ user_id: "nobody" });

    expect(result.isError).toBe(true);
    expect(fake.rpcCalls).toEqual([]);
    expect(navigated).toEqual([]);
  });
});
