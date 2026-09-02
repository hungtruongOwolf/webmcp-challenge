import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UploadError } from "@/app/libs/supabase/upload";
import { uploadChatImage } from "@/app/libs/supabase/upload";
import { sendAttachment } from "./send-attachment";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

vi.mock("@/app/libs/supabase/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/libs/supabase/upload")>()),
  uploadChatImage: vi.fn(),
  uploadChatFile: vi.fn(),
}));

const conversation = {
  name: null,
  members: [{ profile: { id: "me-id", name: "Me" } }, { profile: { id: "other-id", name: "Maya" } }],
};

// A 1x1 PNG.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "msg-1" }) }));
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(uploadChatImage).mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("send_attachment", () => {
  it("requires exactly one source", async () => {
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);
    const tool = sendAttachment(ctx);

    const none = await tool.execute({ conversation_id: "conv-1" });
    const two = await tool.execute({ conversation_id: "conv-1", url: "https://x/a.png", message_id: "m1" });

    expect(none.isError).toBe(true);
    expect(two.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads a data URL through the app's own upload path and sends it with a caption", async () => {
    const remove = vi.fn();
    vi.mocked(uploadChatImage).mockResolvedValue({ url: "https://signed/img", remove });
    const fake = createFakeSupabase({ results: { conversations: [{ data: conversation }] } });
    const { ctx } = createFakeContext(fake.client);

    const result = await sendAttachment(ctx).execute({
      conversation_id: "conv-1",
      data_url: PNG_DATA_URL,
      caption: "a dot",
    });

    expect(result.isError).toBeUndefined();
    const [, , uploaded] = vi.mocked(uploadChatImage).mock.calls[0];
    expect(uploaded.type).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messages",
      expect.objectContaining({
        body: JSON.stringify({ conversationId: "conv-1", message: "a dot", image: "https://signed/img" }),
      })
    );
    expect(resultText(result)).toContain("Maya");
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns the upload helper's reason when the data URL is refused", async () => {
    vi.mocked(uploadChatImage).mockRejectedValue(
      new UploadError("image/bmp is not an allowed image type.")
    );
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const result = await sendAttachment(ctx).execute({
      conversation_id: "conv-1",
      data_url: "data:image/bmp;base64,AAAA",
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("image/bmp is not an allowed image type.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands a URL or an existing message to the server route", async () => {
    const fake = createFakeSupabase({
      results: { conversations: [{ data: conversation }, { data: conversation }] },
    });
    const { ctx } = createFakeContext(fake.client);
    const tool = sendAttachment(ctx);

    await tool.execute({ conversation_id: "conv-1", url: "https://x/cat.png" });
    await tool.execute({ conversation_id: "conv-1", message_id: "m1", caption: "again" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/messages/attachments",
      expect.objectContaining({
        body: JSON.stringify({ conversationId: "conv-1", caption: undefined, url: "https://x/cat.png" }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/messages/attachments",
      expect.objectContaining({
        body: JSON.stringify({ conversationId: "conv-1", caption: "again", sourceMessageId: "m1" }),
      })
    );
  });

  it("relays the server's explanation when the route refuses", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 415, text: async () => "text/html is not accepted." });
    const fake = createFakeSupabase();
    const { ctx } = createFakeContext(fake.client);

    const result = await sendAttachment(ctx).execute({ conversation_id: "conv-1", url: "https://x/page" });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("text/html is not accepted.");
  });
});
