import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteMessage } from "./delete-message";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "m1", deleted: true }) }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("delete_message", () => {
  it("asks for confirmation before deleting, then deletes through the server route", async () => {
    const fake = createFakeSupabase({
      results: { messages: [{ data: { id: "m1", body: "oops", image: null, file_name: null } }] },
    });
    const { ctx } = createFakeContext(fake.client);
    const tool = deleteMessage(ctx);

    const preview = await tool.execute({ message_id: "m1" });
    expect(preview.isError).toBeUndefined();
    expect(resultText(preview)).toContain("oops");
    expect(resultText(preview)).toContain("confirm: true");
    expect(fetchMock).not.toHaveBeenCalled();

    const result = await tool.execute({ message_id: "m1", confirm: true });
    expect(result.isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messages/m1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("relays the refusal when the caller is not the author", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => "Only the author can delete this message." });
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const result = await deleteMessage(ctx).execute({ message_id: "m1", confirm: true });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Only the author can delete this message.");
  });
});
