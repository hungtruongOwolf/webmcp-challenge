// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/app/libs/supabase/server";
import { safeFetch } from "@/app/libs/safe-fetch";
import { POST } from "./route";

vi.mock("@/app/libs/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/libs/safe-fetch", () => ({ safeFetch: vi.fn() }));

const storage = {
  upload: vi.fn(async () => ({ error: null })),
  copy: vi.fn(async () => ({ error: null })),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed/new" }, error: null })),
  remove: vi.fn(async () => ({ error: null })),
};

const rpc = vi.fn();
const maybeSingle = vi.fn();
const select = vi.fn(() => ({ eq: () => ({ maybeSingle }) }));

const request = (body: Record<string, unknown>) =>
  new Request("https://verb.example/api/messages/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
  select.mockClear();
  storage.upload.mockClear();
  storage.copy.mockClear();
  vi.mocked(safeFetch).mockReset();
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "me-id" } } }) },
    rpc,
    storage: { from: () => storage },
    from: () => ({ select }),
  } as never);
});

describe("POST /api/messages/attachments", () => {
  it("requires exactly one source", async () => {
    const both = await POST(
      request({ conversationId: "conv-1", url: "https://x/a.png", sourceMessageId: "m1" })
    );
    const none = await POST(request({ conversationId: "conv-1" }));

    expect(both.status).toBe(400);
    expect(none.status).toBe(400);
  });

  it("refuses a target conversation the caller is not in", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "is_conversation_member" ? { data: false, error: null } : { data: null, error: null }
    );

    const response = await POST(request({ conversationId: "conv-9", url: "https://x/a.png" }));

    expect(response.status).toBe(403);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("fetches a URL server side, stores it under the target folder, and creates the message", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "is_conversation_member"
        ? { data: true, error: null }
        : { data: "msg-new", error: null }
    );
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );

    const response = await POST(
      request({ conversationId: "conv-1", url: "https://x/cat.png", caption: "look" })
    );

    expect(response.status).toBe(200);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^conv-1\/me-id\/.+\.png$/),
      expect.anything(),
      expect.objectContaining({ contentType: "image/png" })
    );
    expect(rpc).toHaveBeenCalledWith(
      "create_message",
      expect.objectContaining({
        p_conversation_id: "conv-1",
        p_body: "look",
        p_image: "https://signed/new",
      })
    );
    await expect(response.json()).resolves.toMatchObject({ id: "msg-new", kind: "image" });
  });

  it("rejects an oversized body while streaming, before the whole thing is read", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
        if (pulled === 12) controller.close();
      },
    });
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(body, { status: 200, headers: { "content-type": "image/png" } })
    );

    const response = await POST(request({ conversationId: "conv-1", url: "https://x/huge.png" }));

    expect(response.status).toBe(413);
    // 4 MB image cap: the reader stops a chunk or two past it, not at 12 MB.
    expect(pulled).toBeLessThan(8);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects a declared Content-Length over the cap without reading the body", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(16));
        if (pulled === 4) controller.close();
      },
    }, { highWaterMark: 0 });
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(50 * 1024 * 1024) },
      })
    );

    const response = await POST(request({ conversationId: "conv-1", url: "https://x/big.png" }));

    expect(response.status).toBe(413);
    expect(pulled).toBe(0);
  });

  it("rejects an unsupported content type without reading the body", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(16));
        if (pulled === 4) controller.close();
      },
    }, { highWaterMark: 0 });
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(body, { status: 200, headers: { "content-type": "text/html" } })
    );

    const response = await POST(request({ conversationId: "conv-1", url: "https://x/page" }));

    expect(response.status).toBe(415);
    expect(pulled).toBe(0);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("copies an existing attachment the caller can read into the target folder", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "is_conversation_member"
        ? { data: true, error: null }
        : { data: "msg-new", error: null }
    );
    maybeSingle.mockResolvedValue({
      data: {
        id: "m1",
        conversation_id: "conv-2",
        body: null,
        image: null,
        file_url: "https://abc.supabase.co/storage/v1/object/sign/chat-files/conv-2/other/x-report.pdf?token=t",
        file_name: "report.pdf",
        file_size: 1234,
      },
      error: null,
    });

    maybeSingle.mockResolvedValueOnce({
      data: { id: "conv-2", name: "Team", is_group: true, members: [] },
      error: null,
    });

    const response = await POST(
      request({ conversationId: "conv-1", sourceMessageId: "m1", caption: "fyi", confirm: true })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ source: { id: "conv-2", name: "Team" } });
    expect(select).toHaveBeenCalledWith(expect.stringContaining("conversation_id"));
    expect(storage.copy).toHaveBeenCalledWith(
      "conv-2/other/x-report.pdf",
      expect.stringMatching(/^conv-1\/me-id\/.+-report\.pdf$/)
    );
    expect(rpc).toHaveBeenCalledWith(
      "create_message",
      expect.objectContaining({
        p_conversation_id: "conv-1",
        p_body: "fyi",
        p_file_url: "https://signed/new",
        p_file_name: "report.pdf",
        p_file_size: 1234,
      })
    );
  });

  it("asks for confirmation before copying an attachment out of a different conversation", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: "m1",
        conversation_id: "conv-2",
        body: null,
        image: "https://abc.supabase.co/storage/v1/object/sign/chat-images/conv-2/other/pic.png?token=t",
        file_url: null,
        file_name: null,
        file_size: null,
      },
      error: null,
    });
    maybeSingle.mockResolvedValueOnce({
      data: { id: "conv-2", name: "Team", is_group: true, members: [] },
      error: null,
    });

    const response = await POST(request({ conversationId: "conv-1", sourceMessageId: "m1" }));

    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toEqual({
      needsConfirmation: true,
      source: { id: "conv-2", name: "Team" },
    });
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("refuses to copy a file whose URL points at the images bucket", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    maybeSingle.mockResolvedValue({
      data: {
        id: "m1",
        conversation_id: "conv-2",
        body: null,
        image: null,
        file_url: "https://abc.supabase.co/storage/v1/object/sign/chat-images/conv-2/other/pic.png?token=t",
        file_name: "pic.png",
        file_size: 10,
      },
      error: null,
    });

    const response = await POST(
      request({ conversationId: "conv-1", sourceMessageId: "m1", confirm: true })
    );

    expect(response.status).toBe(409);
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("reports a source message that is missing or unreadable", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(request({ conversationId: "conv-1", sourceMessageId: "ghost" }));

    expect(response.status).toBe(404);
  });
});
