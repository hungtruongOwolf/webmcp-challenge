import { describe, expect, it } from "vitest";

import { openConversation } from "./open-conversation";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

const direct = {
  id: "conv-1",
  name: null,
  is_group: false,
  members: [
    { profile: { id: "me-id", name: "Me" } },
    { profile: { id: "other-id", name: "Maya" } },
  ],
};

describe("open_conversation", () => {
  it("opens an existing direct chat by user id without creating anything", async () => {
    const fake = createFakeSupabase({ results: { conversations: [{ data: direct }] } });
    const { ctx, navigated } = createFakeContext(fake.client);

    const result = await openConversation(ctx).execute({ user_id: "other-id" });

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("conv-1");
    expect(navigated).toEqual(["/conversations/conv-1"]);
    expect(fake.rpcCalls).toEqual([]);
  });

  it("opens a conversation by its id", async () => {
    const fake = createFakeSupabase({ results: { conversations: [{ data: direct }] } });
    const { ctx, navigated } = createFakeContext(fake.client);

    const result = await openConversation(ctx).execute({ conversation_id: "conv-1" });

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("Maya");
    expect(navigated).toEqual(["/conversations/conv-1"]);
  });

  it("points at start_conversation when no direct chat exists yet", async () => {
    const fake = createFakeSupabase({ results: { conversations: [{ data: null }] } });
    const { ctx, navigated } = createFakeContext(fake.client);

    const result = await openConversation(ctx).execute({ user_id: "other-id" });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("start_conversation");
    expect(navigated).toEqual([]);
    expect(fake.rpcCalls).toEqual([]);
  });

  it("requires either a conversation id or a user id", async () => {
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const result = await openConversation(ctx).execute({});

    expect(result.isError).toBe(true);
  });
});
