import type { SupabaseBrowserClient } from "@/lib/webmcp/types";

const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Mirrors the allowed_mime_types on the chat-images / chat-files buckets so a
// bad file is refused here, with a readable reason, instead of by storage.
export const CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const CHAT_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
] as const;

export type UploadResult = { url: string; remove: () => Promise<void> };

/** A validation failure the user can act on, as opposed to a storage fault. */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

function validateFile(
  file: File | null | undefined,
  allowedTypes: readonly string[],
  maxBytes: number,
  label: string
) {
  if (!file) throw new UploadError(`No file was provided to upload as ${label}.`);
  if (!allowedTypes.includes(file.type)) {
    throw new UploadError(
      `${file.type || "unknown"} is not an allowed ${label} type. Allowed: ${allowedTypes.join(", ")}.`
    );
  }
  if (file.size > maxBytes) {
    throw new UploadError(
      `${file.name || "That file"} is ${formatMb(file.size)}; ${label}s are limited to ${formatMb(maxBytes)}.`
    );
  }
}

/** One sentence naming why an upload failed, for a toast or a tool result. */
export function describeUploadError(err: unknown): string {
  if (err instanceof UploadError) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string" && err.message) {
    return `Upload failed: ${err.message}`;
  }
  return "Upload failed for an unknown reason.";
}

/**
 * Uploads to a private bucket and hands back a long-lived signed URL, since
 * none of these buckets are public -- the storage RLS policies (folder
 * <conversation_id>/<uploader_id>/... for chat-images/chat-files, or
 * <user_id>/... for avatars) are the actual access boundary, not the URL.
 */
async function uploadAndSign(
  supabase: SupabaseBrowserClient,
  bucket: string,
  path: string,
  file: File
) {
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, YEAR_IN_SECONDS);

  if (signError) {
    // The file uploaded fine but nothing will ever point to it -- remove it
    // rather than leaving an orphan in the bucket.
    await supabase.storage.from(bucket).remove([path]).catch(() => {});
    throw signError;
  }

  return {
    url: data.signedUrl,
    remove: () => supabase.storage.from(bucket).remove([path]).then(() => {}),
  };
}

const extensionOf = (name: string) => name.split(".").pop() || "bin";

async function requireUserId(supabase: SupabaseBrowserClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UploadError("You are not signed in, so nothing can be uploaded.");
  return user.id;
}

export async function uploadChatImage(
  supabase: SupabaseBrowserClient,
  conversationId: string,
  file: File
): Promise<UploadResult> {
  validateFile(file, CHAT_IMAGE_TYPES, MAX_IMAGE_BYTES, "image");
  const userId = await requireUserId(supabase);

  const path = `${conversationId}/${userId}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
  return uploadAndSign(supabase, "chat-images", path, file);
}

export async function uploadChatFile(
  supabase: SupabaseBrowserClient,
  conversationId: string,
  file: File
): Promise<UploadResult> {
  validateFile(file, CHAT_FILE_TYPES, MAX_FILE_BYTES, "file");
  const userId = await requireUserId(supabase);

  const path = `${conversationId}/${userId}/${crypto.randomUUID()}-${file.name}`;
  return uploadAndSign(supabase, "chat-files", path, file);
}

export async function uploadAvatar(supabase: SupabaseBrowserClient, file: File): Promise<string> {
  validateFile(file, CHAT_IMAGE_TYPES, MAX_IMAGE_BYTES, "photo");
  const userId = await requireUserId(supabase);

  const path = `${userId}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
  const { url } = await uploadAndSign(supabase, "avatars", path, file);
  return url;
}
