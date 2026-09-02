import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMessage } from "./send-message";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

const conversation = {
  name: null,
  members: [{ profile: { id: "me-id", name: "Me" } }, { profile: { id: "other-id", name: "Maya" } }],
};

const stubFetch = (ok = true) => {
  const fetchMock = vi.fn(async () => ({ ok, status: ok ? 200 : 500 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe("send_message", () => {
  it("sends the given text in one call without reading or clearing a draft", async () => {
    const fetchMock = stubFetch();
    const fake = createFakeSupabase({ results: { conversations: [{ data: conversation }] } });
    const { ctx } = createFakeContext(fake.client);

    const result = await sendMessage(ctx).execute({ conversation_id: "conv-1", text: "hi Maya" });

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("hi Maya");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messages",
      expect.objectContaining({ body: JSON.stringify({ message: "hi Maya", conversationId: "conv-1" }) })
    );
    expect(fake.queries.map((q) => q.table)).not.toContain("drafts");
  });

  it("still sends the saved draft when no text is given", async () => {
    const fetchMock = stubFetch();
    const fake = createFakeSupabase({
      results: {
        drafts: [{ data: { body: "drafted reply" } }, { data: null }],
        conversations: [{ data: conversation }],
      },
    });
    const { ctx } = createFakeContext(fake.client);

    const result = await sendMessage(ctx).execute({ conversation_id: "conv-1" });

    expect(result.isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messages",
      expect.objectContaining({ body: JSON.stringify({ message: "drafted reply", conversationId: "conv-1" }) })
    );
    expect(fake.opsFor("drafts", 1).map(([op]) => op)).toContain("delete");
  });

  it("explains both options when there is neither text nor a draft", async () => {
    stubFetch();
    const fake = createFakeSupabase({ results: { drafts: [{ data: null }] } });
    const { ctx } = createFakeContext(fake.client);

    const result = await sendMessage(ctx).execute({ conversation_id: "conv-1" });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("text");
    expect(resultText(result)).toContain("draft_message");
  });
});
