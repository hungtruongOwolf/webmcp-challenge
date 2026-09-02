import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/app/types/database";
import {
  CHAT_FILE_TYPES,
  CHAT_IMAGE_TYPES,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
} from "@/app/libs/supabase/upload";

type Client = SupabaseClient<Database>;

const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export type AttachmentKind = "image" | "file";

export type StoredAttachment = {
  kind: AttachmentKind;
  url: string;
  fileName: string | null;
  fileSize: number | null;
  remove: () => Promise<void>;
};

export type SourceMessageAttachment = {
  conversation_id: string;
  image: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
};

/** A refusal the caller can act on, with the HTTP status the route should use. */
export class AttachmentError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AttachmentError";
  }
}

const IMAGE_TYPES: readonly string[] = CHAT_IMAGE_TYPES;
const FILE_TYPES: readonly string[] = CHAT_FILE_TYPES;

export function classifyAttachment(contentType: string): {
  kind: AttachmentKind;
  bucket: "chat-images" | "chat-files";
} | null {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  if (IMAGE_TYPES.includes(mime)) return { kind: "image", bucket: "chat-images" };
  if (FILE_TYPES.includes(mime)) return { kind: "file", bucket: "chat-files" };
  return null;
}

/**
 * Recovers bucket and object path from one of Verb's own signed URLs, so an
 * attachment can be copied with storage.copy() (subject to the same RLS as a
 * read plus an upload) instead of re-downloading it through a URL the model
 * retyped.
 */
export function storageObjectFromUrl(url: string): { bucket: string; path: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const match = parsed.pathname.match(
    /\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/
  );
  if (!match) return null;

  try {
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

const BUCKET_FOR: Record<AttachmentKind, "chat-images" | "chat-files"> = {
  image: "chat-images",
  file: "chat-files",
};

/** True when the URL is served by this project's Supabase instance. */
export function isOwnStorageOrigin(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/**
 * Resolves a message attachment URL to its storage object, refusing unless
 * it sits in the bucket that column is meant for and under the folder of
 * the conversation the message belongs to. Any member can write whatever
 * URL they like into a row, so the row alone is not proof the object is
 * theirs to share.
 */
export function ownAttachmentObject(
  url: string,
  kind: AttachmentKind,
  conversationId: string,
  status: number
): { bucket: string; path: string } {
  const object = storageObjectFromUrl(url);
  if (!object) throw new AttachmentError("That attachment is not stored in Verb.", status);
  if (object.bucket !== BUCKET_FOR[kind] || !object.path.startsWith(`${conversationId}/`)) {
    throw new AttachmentError(
      "That attachment does not belong to the conversation it was posted in.",
      status
    );
  }
  return object;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
};

function extensionFor(name: string, contentType: string): string {
  const fromName = name.includes(".") ? name.split(".").pop() : "";
  if (fromName) return fromName.toLowerCase();
  return MIME_EXTENSIONS[contentType.split(";")[0].trim().toLowerCase()] || "bin";
}

// Same folder convention as the browser upload helper; the storage policies
// key on <conversation_id>/<uploader_id>/... for both buckets.
function objectPath(kind: AttachmentKind, conversationId: string, userId: string, name: string, ext: string) {
  return kind === "image"
    ? `${conversationId}/${userId}/${crypto.randomUUID()}.${ext}`
    : `${conversationId}/${userId}/${crypto.randomUUID()}-${name}`;
}

async function sign(
  supabase: Client,
  bucket: string,
  path: string
): Promise<{ url: string; remove: () => Promise<void> }> {
  const remove = async () => {
    await supabase.storage.from(bucket).remove([path]);
  };
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, YEAR_IN_SECONDS);
  if (error || !data) {
    await remove().catch(() => {});
    throw new AttachmentError(`Stored the file but could not link it: ${error?.message || "unknown error"}`, 500);
  }
  return { url: data.signedUrl, remove };
}

/** classifyAttachment, but phrased as the refusal the route sends back. */
export function requireAttachmentTarget(contentType: string) {
  const target = classifyAttachment(contentType);
  if (!target) {
    throw new AttachmentError(
      `${contentType || "unknown"} is not accepted. Images: ${IMAGE_TYPES.join(", ")}. Files: ${FILE_TYPES.join(", ")}.`,
      415
    );
  }
  return target;
}

export const attachmentLimit = (kind: AttachmentKind) =>
  kind === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;

const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export function assertWithinLimit(kind: AttachmentKind, byteLength: number) {
  const limit = attachmentLimit(kind);
  if (byteLength > limit) {
    throw new AttachmentError(
      `That ${kind} is ${formatMb(byteLength)}; the limit is ${formatMb(limit)}.`,
      413
    );
  }
}

/**
 * Reads a fetched body with a running byte count and gives up as soon as it
 * passes the cap, so a remote host cannot make this server buffer gigabytes
 * before the size check runs.
 */
export async function readBodyWithinLimit(
  body: ReadableStream<Uint8Array> | null,
  kind: AttachmentKind
): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0);

  const limit = attachmentLimit(kind);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new AttachmentError(`That ${kind} is over the ${formatMb(limit)} limit.`, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Uploads bytes fetched server side into the target conversation's folder. */
export async function storeFetchedAttachment(
  supabase: Client,
  input: {
    bytes: Uint8Array;
    contentType: string;
    name: string;
    conversationId: string;
    userId: string;
  }
): Promise<StoredAttachment> {
  const target = requireAttachmentTarget(input.contentType);
  assertWithinLimit(target.kind, input.bytes.byteLength);

  const name = input.name || `attachment.${extensionFor("", input.contentType)}`;
  const path = objectPath(target.kind, input.conversationId, input.userId, name, extensionFor(name, input.contentType));

  const { error } = await supabase.storage
    .from(target.bucket)
    .upload(path, input.bytes, { contentType: input.contentType.split(";")[0].trim(), upsert: false });
  if (error) throw new AttachmentError(`Storage refused the upload: ${error.message}`, 500);

  const signed = await sign(supabase, target.bucket, path);
  return {
    kind: target.kind,
    url: signed.url,
    fileName: target.kind === "file" ? name : null,
    fileSize: target.kind === "file" ? input.bytes.byteLength : null,
    remove: signed.remove,
  };
}

/**
 * Copies an existing message's attachment into another conversation's
 * folder. The caller's client must be able to read the source object and
 * upload to the target folder, which is exactly "member of both".
 */
export async function copyMessageAttachment(
  supabase: Client,
  source: SourceMessageAttachment,
  targetConversationId: string,
  userId: string
): Promise<StoredAttachment | null> {
  const sourceUrl = source.image ?? source.file_url;
  if (!sourceUrl) return null;

  const kind: AttachmentKind = source.image ? "image" : "file";
  const object = ownAttachmentObject(sourceUrl, kind, source.conversation_id, 409);

  const baseName = object.path.split("/").pop() || "attachment";
  const name = source.file_name || baseName;
  const path = objectPath(kind, targetConversationId, userId, name, extensionFor(baseName, ""));

  const { error } = await supabase.storage.from(object.bucket).copy(object.path, path);
  if (error) throw new AttachmentError(`Could not copy the attachment: ${error.message}`, 500);

  const signed = await sign(supabase, object.bucket, path);
  return {
    kind,
    url: signed.url,
    fileName: kind === "file" ? name : null,
    fileSize: kind === "file" ? source.file_size : null,
    remove: signed.remove,
  };
}

/** The create_message arguments for a stored attachment plus optional text. */
export function createMessageArgs(
  conversationId: string,
  body: string | null,
  attachment: StoredAttachment | null
) {
  return {
    p_conversation_id: conversationId,
    p_body: body ?? undefined,
    p_image: attachment?.kind === "image" ? attachment.url : undefined,
    p_file_url: attachment?.kind === "file" ? attachment.url : undefined,
    p_file_name: attachment?.kind === "file" ? attachment.fileName ?? undefined : undefined,
    p_file_size: attachment?.kind === "file" ? attachment.fileSize ?? undefined : undefined,
  };
}
