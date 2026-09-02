import { beforeEach, describe, expect, it, vi } from "vitest";

import { classifyAttachment, copyMessageAttachment, storageObjectFromUrl } from "./attachments";
import type { SourceMessageAttachment } from "./attachments";

describe("storageObjectFromUrl", () => {
  it("recovers bucket and object path from a signed URL", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/sign/chat-images/conv-1/me-id/photo%20one.png?token=xyz";

    expect(storageObjectFromUrl(url)).toEqual({
      bucket: "chat-images",
      path: "conv-1/me-id/photo one.png",
    });
  });

  it("returns null for anything that is not a storage object URL", () => {
    expect(storageObjectFromUrl("https://example.org/cat.png")).toBeNull();
    expect(storageObjectFromUrl("not a url")).toBeNull();
  });
});

describe("classifyAttachment", () => {
  it("routes images and documents to their buckets", () => {
    expect(classifyAttachment("image/png")).toEqual({ kind: "image", bucket: "chat-images" });
    expect(classifyAttachment("application/pdf; charset=binary")).toEqual({
      kind: "file",
      bucket: "chat-files",
    });
  });

  it("rejects types neither bucket accepts", () => {
    expect(classifyAttachment("text/html")).toBeNull();
  });
});

describe("copyMessageAttachment", () => {
  const storage = {
    copy: vi.fn(async () => ({ error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed/copy" }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
  const client = { storage: { from: () => storage } } as never;

  const signed = (bucket: string, path: string) =>
    `https://abc.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t`;

  const source = (overrides: Partial<SourceMessageAttachment>): SourceMessageAttachment => ({
    conversation_id: "conv-src",
    image: null,
    file_url: null,
    file_name: null,
    file_size: null,
    ...overrides,
  });

  beforeEach(() => {
    storage.copy.mockClear();
  });

  it("copies an image that lives in chat-images under its own conversation", async () => {
    const stored = await copyMessageAttachment(
      client,
      source({ image: signed("chat-images", "conv-src/other/pic.png") }),
      "conv-target",
      "me-id"
    );

    expect(stored?.kind).toBe("image");
    expect(storage.copy).toHaveBeenCalledWith(
      "conv-src/other/pic.png",
      expect.stringMatching(/^conv-target\/me-id\//)
    );
  });

  it("refuses an image column that points at the files bucket", async () => {
    await expect(
      copyMessageAttachment(
        client,
        source({ image: signed("chat-files", "conv-src/other/secret.pdf") }),
        "conv-target",
        "me-id"
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("refuses a file column that points at the images bucket", async () => {
    await expect(
      copyMessageAttachment(
        client,
        source({ file_url: signed("chat-images", "conv-src/other/pic.png"), file_name: "pic.png" }),
        "conv-target",
        "me-id"
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("refuses an object filed under a different conversation than the message", async () => {
    await expect(
      copyMessageAttachment(
        client,
        source({ image: signed("chat-images", "conv-elsewhere/other/pic.png") }),
        "conv-target",
        "me-id"
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("refuses a URL that is not one of Verb's storage objects", async () => {
    await expect(
      copyMessageAttachment(client, source({ image: "https://example.org/pic.png" }), "conv-target", "me-id")
    ).rejects.toMatchObject({ status: 409 });
  });
});
