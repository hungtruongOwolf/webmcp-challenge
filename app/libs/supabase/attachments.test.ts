import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyAttachment,
  copyMessageAttachment,
  safeFileName,
  storageObjectFromUrl,
  storeFetchedAttachment,
  withDownload,
} from "./attachments";
import type { SourceMessageAttachment } from "./attachments";

describe("safeFileName", () => {
  it("leaves an ordinary name alone", () => {
    expect(safeFileName("Q3 report.pdf")).toBe("Q3 report.pdf");
  });

  it("strips path separators and parent-directory hops", () => {
    for (const name of ["../../etc/passwd", "..\\..\\win.ini", "a/../b.txt", "dir/file.pdf"]) {
      const safe = safeFileName(name);
      expect(safe).not.toMatch(/[\\/]/);
      expect(safe).not.toContain("..");
      expect(safe.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a fixed name when nothing usable is left", () => {
    expect(safeFileName("")).toBe("attachment");
    expect(safeFileName("../")).toBe("attachment");
  });
});

describe("withDownload", () => {
  it("adds the download flag whether or not the URL already has a query", () => {
    expect(withDownload("https://abc.supabase.co/storage/v1/object/sign/chat-files/a/b.pdf?token=t")).toBe(
      "https://abc.supabase.co/storage/v1/object/sign/chat-files/a/b.pdf?token=t&download"
    );
    expect(withDownload("https://abc.supabase.co/storage/v1/object/public/chat-files/a/b.pdf")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/chat-files/a/b.pdf?download"
    );
  });
});

describe("storeFetchedAttachment", () => {
  const storage = {
    upload: vi.fn(async () => ({ error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed/new" }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
  const client = { storage: { from: () => storage } } as never;

  beforeEach(() => {
    storage.upload.mockClear();
  });

  it("names the stored image by its validated content type, not the remote file name", async () => {
    await storeFetchedAttachment(client, {
      bytes: new Uint8Array([1]),
      contentType: "image/png",
      name: "evil.html",
      conversationId: "conv-1",
      userId: "me-id",
    });

    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^conv-1\/me-id\/[^/]+\.png$/),
      expect.anything(),
      expect.anything()
    );
  });

  it("keeps a remote file name inside the conversation folder", async () => {
    const stored = await storeFetchedAttachment(client, {
      bytes: new Uint8Array([1]),
      contentType: "application/pdf",
      name: "../../etc/passwd.pdf",
      conversationId: "conv-1",
      userId: "me-id",
    });

    const [path] = storage.upload.mock.calls[0] as unknown as [string];
    expect(path).toMatch(/^conv-1\/me-id\/[^/]+$/);
    expect(path).not.toContain("..");
    expect(stored.fileName).not.toMatch(/[\\/]/);
    expect(stored.fileName).not.toContain("..");
  });
});

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
