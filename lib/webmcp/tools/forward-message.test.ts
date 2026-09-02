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
      expect.objectContaining({ method: "POST", body: JSON.stringify({ conversationId: "conv-1" }) })
    );
    expect(resultText(result)).toContain("Team");
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
