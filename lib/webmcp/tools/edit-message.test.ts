import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { editMessage } from "./edit-message";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "m1" }) }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("edit_message", () => {
  it("patches the message text through the server route", async () => {
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const result = await editMessage(ctx).execute({ message_id: "m1", text: "fixed" });

    expect(result.isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messages/m1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ body: "fixed" }) })
    );
    expect(resultText(result)).toContain("fixed");
  });

  it("relays the refusal when the caller is not the author", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => "Only the author can edit this message." });
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const result = await editMessage(ctx).execute({ message_id: "m1", text: "nope" });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Only the author can edit this message.");
  });

  it("requires non-empty text", async () => {
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const result = await editMessage(ctx).execute({ message_id: "m1", text: "  " });

    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
