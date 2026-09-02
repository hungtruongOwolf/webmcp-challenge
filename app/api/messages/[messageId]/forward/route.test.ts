// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/app/libs/supabase/server";
import { POST } from "./route";

vi.mock("@/app/libs/supabase/server", () => ({ createClient: vi.fn() }));

const storage = {
  copy: vi.fn(async () => ({ error: null })),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed/copy" }, error: null })),
  remove: vi.fn(async () => ({ error: null })),
};
const rpc = vi.fn();
const maybeSingle = vi.fn();

const call = (messageId: string, body: Record<string, unknown>) =>
  POST(
    new Request(`https://verb.example/api/messages/${messageId}/forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ messageId }) }
  );

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
  storage.copy.mockClear();
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "me-id" } } }) },
    rpc,
    storage: { from: () => storage },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  } as never);
});

describe("POST /api/messages/[messageId]/forward", () => {
  it("refuses a target the caller is not a member of", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    const response = await call("m1", { conversationId: "conv-9" });

    expect(response.status).toBe(403);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("forwards text and a copied image into the target conversation", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "is_conversation_member"
        ? { data: true, error: null }
        : { data: "msg-fwd", error: null }
    );
    maybeSingle.mockResolvedValue({
      data: {
        id: "m1",
        body: "see this",
        image: "https://abc.supabase.co/storage/v1/object/sign/chat-images/conv-2/other/pic.png?token=t",
        file_url: null,
        file_name: null,
        file_size: null,
      },
      error: null,
    });

    const response = await call("m1", { conversationId: "conv-1" });

    expect(response.status).toBe(200);
    expect(storage.copy).toHaveBeenCalledWith(
      "conv-2/other/pic.png",
      expect.stringMatching(/^conv-1\/me-id\/.+\.png$/)
    );
    expect(rpc).toHaveBeenCalledWith(
      "create_message",
      expect.objectContaining({
        p_conversation_id: "conv-1",
        p_body: "see this",
        p_image: "https://signed/copy",
      })
    );
    await expect(response.json()).resolves.toMatchObject({ id: "msg-fwd" });
  });

  it("reports a source message that is missing or unreadable", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await call("ghost", { conversationId: "conv-1" });

    expect(response.status).toBe(404);
  });
});
