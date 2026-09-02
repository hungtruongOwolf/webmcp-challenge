import { describe, expect, it, vi } from "vitest";

import type { SupabaseBrowserClient } from "@/lib/webmcp/types";

import { describeUploadError, uploadChatFile, uploadChatImage } from "./upload";

const makeClient = (uploadError: { message: string } | null = null) => {
  const upload = vi.fn(async () => ({ error: uploadError }));
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://signed" }, error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "me-id" } } }) },
    storage: { from: () => ({ upload, createSignedUrl, remove }) },
  };
  return { client: client as unknown as SupabaseBrowserClient, upload };
};

const file = (name: string, type: string, bytes: number) =>
  new File([new Uint8Array(bytes)], name, { type });

describe("upload helpers", () => {
  it("rejects a missing file with a specific reason", async () => {
    const { client, upload } = makeClient();

    await expect(
      uploadChatImage(client, "conv-1", undefined as unknown as File)
    ).rejects.toThrow(/no file/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it("names the rejected type and the allowed ones", async () => {
    const { client, upload } = makeClient();

    const err = await uploadChatImage(client, "conv-1", file("notes.txt", "text/plain", 10)).catch(
      (e) => e
    );

    expect(describeUploadError(err)).toMatch(/text\/plain/);
    expect(describeUploadError(err)).toMatch(/image\/png/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("names the size limit that was exceeded", async () => {
    const { client } = makeClient();

    const err = await uploadChatFile(
      client,
      "conv-1",
      file("big.pdf", "application/pdf", 21 * 1024 * 1024)
    ).catch((e) => e);

    expect(describeUploadError(err)).toMatch(/20 MB/);
  });

  it("surfaces the storage error message instead of a generic one", async () => {
    const { client } = makeClient({ message: "new row violates row-level security policy" });

    const err = await uploadChatImage(client, "conv-1", file("a.png", "image/png", 10)).catch(
      (e) => e
    );

    expect(describeUploadError(err)).toContain("row-level security");
  });

  it("falls back to a generic sentence for unknown failures", () => {
    expect(describeUploadError(undefined)).toMatch(/upload failed/i);
  });
});
