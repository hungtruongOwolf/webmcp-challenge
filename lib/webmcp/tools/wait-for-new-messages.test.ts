import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { wrapUntrusted } from "@/lib/webmcp/budget";

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
    const { ctx, inbox } = createFakeContext(fake.client);
    inbox.setLive(true);
    const tool = waitForNewMessages(ctx);

    const pending = tool.execute({ timeout_seconds: 30 });
    await vi.advanceTimersByTimeAsync(0);
    inbox.publish(incoming());
    const result = await pending;

    expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(result.isError).toBeUndefined();
    // A display name is user-controlled, so it gets the same marker as the body.
    expect(resultText(result)).toContain(wrapUntrusted("Maya"));
    expect(resultText(result)).toContain(wrapUntrusted("are you there?"));
    expect(resultText(result)).toContain("conv-1");
    expect(fake.channels).toEqual([]);
    expect(inbox.listenerCount()).toBe(0);
  });

  it("returns a reply even when the client clock is ahead of the server", async () => {
    const fake = createFakeSupabase({
      results: { profiles: [{ data: [{ id: "other-id", name: "Maya" }] }] },
    });
    const { ctx, inbox } = createFakeContext(fake.client);
    inbox.setLive(true);

    const pending = waitForNewMessages(ctx).execute({ timeout_seconds: 30 });
    await vi.advanceTimersByTimeAsync(0);
    inbox.publish(incoming({ created_at: "2026-09-02T09:59:00+00:00" }));
    const result = await pending;

    expect(resultText(result)).toContain("are you there?");
  });

  it("never opens or removes the sidebar's inbox channel", async () => {
    const fake = createFakeSupabase({
      results: { profiles: [{ data: [{ id: "other-id", name: "Maya" }] }] },
    });
    const { ctx, inbox } = createFakeContext(fake.client);
    inbox.setLive(true);
    const sidebar = fake.client.channel("user:me-id");
    const tool = waitForNewMessages(ctx);

    const timedOut = tool.execute({ timeout_seconds: 5 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(resultText(await timedOut)).toContain("timedOut: true");

    const answered = tool.execute({ timeout_seconds: 5 });
    await vi.advanceTimersByTimeAsync(0);
    inbox.publish(incoming());
    expect(resultText(await answered)).toContain("timedOut: false");

    expect(fake.channels).toEqual([sidebar]);
    expect(fake.removedChannels).toEqual([]);
    expect(fake.client.channel("user:me-id")).toBe(sidebar);
  });

  it("ignores my own messages, other conversations, and non-inserts, then reports a timeout", async () => {
    const fake = createFakeSupabase();
    const { ctx, inbox } = createFakeContext(fake.client);
    inbox.setLive(true);

    const pending = waitForNewMessages(ctx).execute({
      conversation_id: "conv-1",
      timeout_seconds: 5,
    });
    await vi.advanceTimersByTimeAsync(0);
    inbox.publish(incoming({ sender_id: "me-id" }));
    inbox.publish(incoming({ conversation_id: "conv-2" }));
    inbox.publish({ ...incoming(), operation: "UPDATE" });
    inbox.publish({ ...incoming(), old_record: { id: "msg-1" } });
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("timedOut: true");
    expect(inbox.listenerCount()).toBe(0);
  });

  it("caps the wait at 60 seconds", async () => {
    const fake = createFakeSupabase();
    const { ctx, inbox } = createFakeContext(fake.client);
    inbox.setLive(true);

    const pending = waitForNewMessages(ctx).execute({ timeout_seconds: 500 });
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;

    expect(resultText(result)).toContain("timedOut: true");
    expect(resultText(result)).toContain("60 seconds");
  });

  it("falls back to polling every 2 seconds when the inbox channel is not live", async () => {
    const fake = createFakeSupabase({
      results: {
        messages: [{ data: [] }, { data: [incoming().record] }],
        profiles: [{ data: [{ id: "other-id", name: "Maya" }] }],
      },
    });
    const { ctx } = createFakeContext(fake.client);

    const pending = waitForNewMessages(ctx).execute({ timeout_seconds: 30 });
    await vi.advanceTimersByTimeAsync(4_000);
    const result = await pending;

    expect(resultText(result)).toContain("are you there?");
    expect(fake.queries.filter((q) => q.table === "messages")).toHaveLength(2);
    expect(fake.opsFor("messages")).toContainEqual(["neq", ["sender_id", "me-id"]]);
    expect(fake.channels).toEqual([]);
  });

  it("starts polling when the inbox channel drops mid-wait", async () => {
    const fake = createFakeSupabase({
      results: {
        messages: [{ data: [] }, { data: [incoming().record] }],
        profiles: [{ data: [{ id: "other-id", name: "Maya" }] }],
      },
    });
    const { ctx, inbox } = createFakeContext(fake.client);
    inbox.setLive(true);

    const pending = waitForNewMessages(ctx).execute({ timeout_seconds: 30 });
    await vi.advanceTimersByTimeAsync(1_000);
    // Only the call-start snapshot of existing ids; no polling while live.
    expect(fake.queries.filter((q) => q.table === "messages")).toHaveLength(1);

    inbox.setLive(false);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;

    expect(resultText(result)).toContain("are you there?");
  });

  it("dedupes polled rows by id against what existed at call start, not by timestamp", async () => {
    const existing = incoming({ id: "msg-old", body: "old news", created_at: "2026-09-02T09:00:00+00:00" }).record;
    // Stamped before the (fast) client clock: a created_at comparison would drop it.
    const fresh = incoming({ id: "msg-new", body: "brand new", created_at: "2026-09-02T09:59:59+00:00" }).record;
    const fake = createFakeSupabase({
      results: {
        messages: [{ data: [existing] }, { data: [fresh, existing] }],
        profiles: [{ data: [{ id: "other-id", name: "Maya" }] }],
      },
    });
    const { ctx } = createFakeContext(fake.client);

    const pending = waitForNewMessages(ctx).execute({ timeout_seconds: 30 });
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;

    expect(resultText(result)).toContain("1 new message(s)");
    expect(resultText(result)).toContain("brand new");
    expect(resultText(result)).not.toContain("old news");
    const pollOps = fake.opsFor("messages", 1).map(([op]) => op);
    expect(pollOps).not.toContain("gt");
    expect(pollOps).not.toContain("gte");
  });
});
