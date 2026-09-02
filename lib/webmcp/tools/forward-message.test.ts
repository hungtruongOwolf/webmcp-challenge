import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forwardMessage } from "./forward-message";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

const conversation = { name: "Team", members: [] };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "msg-fwd" }) }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("forward_message", () => {
  it("forwards through the server route and names the target", async () => {
    const fake = createFakeSupabase({ results: { conversations: [{ data: conversation }] } });
    const { ctx } = createFakeContext(fake.client);

    const result = await forwardMessage(ctx).execute({ message_id: "m1", conversation_id: "conv-1" });

    expect(result.isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messages/m1/forward",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-1", confirm: false }),
      })
    );
    expect(resultText(result)).toContain("Team");
  });

  it("previews a move out of another conversation, then forwards once confirmed", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 428,
      json: async () => ({ needsConfirmation: true, source: { id: "conv-2", name: "Maya" } }),
      text: async () => "",
    });
    const fake = createFakeSupabase({
      results: { conversations: [{ data: conversation }, { data: conversation }] },
    });
    const { ctx } = createFakeContext(fake.client);
    const tool = forwardMessage(ctx);

    const preview = await tool.execute({ message_id: "m1", conversation_id: "conv-1" });

    expect(preview.isError).toBeUndefined();
    expect(resultText(preview)).toContain("Maya");
    expect(resultText(preview)).toContain("conv-2");
    expect(resultText(preview)).toContain("different conversation");
    expect(resultText(preview)).toContain("confirm: true");

    await tool.execute({ message_id: "m1", conversation_id: "conv-1", confirm: true });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/messages/m1/forward",
      expect.objectContaining({ body: JSON.stringify({ conversationId: "conv-1", confirm: true }) })
    );
  });

  it("relays the server's refusal", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => "Not a member of the target." });
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const result = await forwardMessage(ctx).execute({ message_id: "m1", conversation_id: "conv-9" });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Not a member of the target.");
  });
});
