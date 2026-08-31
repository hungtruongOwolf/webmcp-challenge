import type { SupabaseBrowserClient } from "@/lib/webmcp/types";

const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

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

  if (signError) throw signError;

  return data.signedUrl;
}

const extensionOf = (name: string) => name.split(".").pop() || "bin";

export async function uploadChatImage(
  supabase: SupabaseBrowserClient,
  conversationId: string,
  file: File
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const path = `${conversationId}/${user.id}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
  return uploadAndSign(supabase, "chat-images", path, file);
}

export async function uploadChatFile(
  supabase: SupabaseBrowserClient,
  conversationId: string,
  file: File
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const path = `${conversationId}/${user.id}/${crypto.randomUUID()}-${file.name}`;
  return uploadAndSign(supabase, "chat-files", path, file);
}

export async function uploadAvatar(supabase: SupabaseBrowserClient, file: File) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const path = `${user.id}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
  return uploadAndSign(supabase, "avatars", path, file);
}
