import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { waitForNewMessages } from "./wait-for-new-messages";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

const incoming = (overrides: Record<string, unknown> = {}) => ({
  table: "messages",
  operation: "INSERT",
  record: {
    id: "msg-1",
    conversation_id: "conv-1",
    sender_id: "other-id",
    body: "are you there?",
    image: null,
    file_name: null,
    created_at: new Date(Date.now() + 10).toISOString(),
    ...overrides,
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-02T10:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("wait_for_new_messages", () => {
  it("resolves with the message the moment someone else writes", async () => {
    const fake = createFakeSupabase({
      results: { profiles: [{ data: [{ id: "other-id", name: "Maya" }] }] },
    });
    const { ctx } = createFakeContext(fake.client);
    const tool = waitForNewMessages(ctx);

    const pending = tool.execute({ timeout_seconds: 30 });
    await vi.advanceTimersByTimeAsync(0);
    const [channel] = fake.channels;
    channel.setStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(0);
    channel.broadcast(incoming());
    const result = await pending;

    expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("Maya");
    expect(resultText(result)).toContain("are you there?");
    expect(resultText(result)).toContain("conv-1");
    expect(fake.removedChannels).toEqual([channel]);
  });

  it("ignores my own messages and other conversations, then reports a timeout", async () => {
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const pending = waitForNewMessages(ctx).execute({
      conversation_id: "conv-1",
      timeout_seconds: 5,
    });
    await vi.advanceTimersByTimeAsync(0);
    const [channel] = fake.channels;
    channel.setStatus("SUBSCRIBED");
    channel.broadcast(incoming({ sender_id: "me-id" }));
    channel.broadcast(incoming({ conversation_id: "conv-2" }));
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("timedOut: true");
    expect(fake.removedChannels).toEqual([channel]);
  });

  it("caps the wait at 60 seconds", async () => {
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const pending = waitForNewMessages(ctx).execute({ timeout_seconds: 500 });
    await vi.advanceTimersByTimeAsync(0);
    fake.channels[0].setStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;

    expect(resultText(result)).toContain("timedOut: true");
    expect(resultText(result)).toContain("60 seconds");
  });

  it("falls back to polling every 2 seconds when realtime is unavailable", async () => {
    const fake = createFakeSupabase({
      results: {
        messages: [{ data: [] }, { data: [incoming().record] }],
        profiles: [{ data: [{ id: "other-id", name: "Maya" }] }],
      },
    });
    const { ctx } = createFakeContext(fake.client);

    const pending = waitForNewMessages(ctx).execute({ timeout_seconds: 30 });
    await vi.advanceTimersByTimeAsync(0);
    fake.channels[0].setStatus("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(4_000);
    const result = await pending;

    expect(resultText(result)).toContain("are you there?");
    expect(fake.queries.filter((q) => q.table === "messages")).toHaveLength(2);
    expect(fake.opsFor("messages")).toContainEqual(["neq", ["sender_id", "me-id"]]);
  });
});
