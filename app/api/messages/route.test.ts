// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/app/libs/supabase/server";
import { POST } from "./route";

vi.mock("@/app/libs/supabase/server", () => ({ createClient: vi.fn() }));

const rpc = vi.fn();
const single = vi.fn();

const request = (body: Record<string, unknown>) =>
  new Request("https://verb.example/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const own = (bucket: string, path: string) =>
  `https://abc.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t`;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  rpc.mockReset().mockResolvedValue({ data: "msg-new", error: null });
  single.mockReset().mockResolvedValue({
    data: { id: "msg-new", body: null, sender: null, seen: [], conversation_id: "conv-1" },
    error: null,
  });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "me-id" } } }) },
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  } as never);
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/messages", () => {
  it("accepts an image stored in chat-images under the message's own conversation", async () => {
    const response = await POST(
      request({ conversationId: "conv-1", image: own("chat-images", "conv-1/me-id/pic.png") })
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "create_message",
      expect.objectContaining({ p_image: own("chat-images", "conv-1/me-id/pic.png") })
    );
  });

  it("accepts a file stored in chat-files under the message's own conversation", async () => {
    const response = await POST(
      request({
        conversationId: "conv-1",
        fileUrl: own("chat-files", "conv-1/me-id/x-report.pdf"),
        fileName: "report.pdf",
        fileSize: 12,
      })
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "create_message",
      expect.objectContaining({ p_file_url: own("chat-files", "conv-1/me-id/x-report.pdf") })
    );
  });

  it.each([
    ["an image from another host", { image: "https://evil.example/storage/v1/object/sign/chat-images/conv-1/me-id/pic.png" }],
    ["an image from another conversation's folder", { image: own("chat-images", "conv-2/me-id/pic.png") }],
    ["an image that lives in the files bucket", { image: own("chat-files", "conv-1/me-id/pic.png") }],
    ["a file that lives in the images bucket", { fileUrl: own("chat-images", "conv-1/me-id/a.pdf") }],
    ["a file from another conversation's folder", { fileUrl: own("chat-files", "conv-2/me-id/a.pdf") }],
    ["a plain external link as an image", { image: "https://example.org/pic.png" }],
  ])("refuses %s", async (_label, fields) => {
    const response = await POST(request({ conversationId: "conv-1", ...fields }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
