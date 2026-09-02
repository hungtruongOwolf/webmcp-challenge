import { describe, expect, it } from "vitest";

import { classifyAttachment, storageObjectFromUrl } from "./attachments";

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
