// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/app/libs/supabase/server";
import { DELETE, PATCH } from "./route";

vi.mock("@/app/libs/supabase/server", () => ({ createClient: vi.fn() }));

const lookup = vi.fn();
const update = vi.fn();
const updateResult = vi.fn();
const remove = vi.fn(async () => ({ error: null }));

const call = (method: "PATCH" | "DELETE", messageId: string, body?: Record<string, unknown>) => {
  const request = new Request(`https://verb.example/api/messages/${messageId}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const context = { params: Promise.resolve({ messageId }) };
  return method === "PATCH" ? PATCH(request, context) : DELETE(request, context);
};

beforeEach(() => {
  lookup.mockReset();
  update.mockReset();
  updateResult.mockReset().mockResolvedValue({ data: { id: "m1" }, error: null });
  remove.mockClear();
  update.mockImplementation((patch: Record<string, unknown>) => ({
    eq: () => ({
      eq: () => ({
        is: () => ({ select: () => ({ maybeSingle: () => updateResult(patch) }) }),
      }),
    }),
  }));
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "me-id" } } }) },
    storage: { from: () => ({ remove }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: lookup }) }),
      update,
    }),
  } as never);
});

describe("PATCH /api/messages/[messageId]", () => {
  it("lets only the author edit, and stamps edited_at", async () => {
    lookup.mockResolvedValue({
      data: { id: "m1", sender_id: "me-id", deleted_at: null, image: null, file_url: null },
      error: null,
    });

    const response = await call("PATCH", "m1", { body: "fixed typo" });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ body: "fixed typo", edited_at: expect.any(String) })
    );
  });

  it("refuses someone else's message", async () => {
    lookup.mockResolvedValue({
      data: { id: "m1", sender_id: "other-id", deleted_at: null, image: null, file_url: null },
      error: null,
    });

    const response = await call("PATCH", "m1", { body: "hijack" });

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an empty body and a missing message", async () => {
    lookup.mockResolvedValue({ data: null, error: null });

    const empty = await call("PATCH", "m1", { body: "   " });
    const missing = await call("PATCH", "ghost", { body: "hello" });

    expect(empty.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe("DELETE /api/messages/[messageId]", () => {
  it("soft-deletes the author's own message, clears its content, and drops the stored file", async () => {
    lookup.mockResolvedValue({
      data: {
        id: "m1",
        sender_id: "me-id",
        deleted_at: null,
        image: "https://abc.supabase.co/storage/v1/object/sign/chat-images/conv-1/me-id/pic.png?token=t",
        file_url: null,
      },
      error: null,
    });

    const response = await call("DELETE", "m1");

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
        body: null,
        image: null,
        file_url: null,
      })
    );
    expect(remove).toHaveBeenCalledWith(["conv-1/me-id/pic.png"]);
  });

  it("refuses someone else's message", async () => {
    lookup.mockResolvedValue({
      data: { id: "m1", sender_id: "other-id", deleted_at: null, image: null, file_url: null },
      error: null,
    });

    const response = await call("DELETE", "m1");

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
});
