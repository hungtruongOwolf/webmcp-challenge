import type { SupabaseBrowserClient } from "@/lib/webmcp/types";

type MemberProfile = { id: string; name: string | null };

export type ConversationHead = {
  id: string;
  name: string | null;
  is_group: boolean;
  members: Array<{ profile: MemberProfile | null }>;
};

const HEAD_SELECT = "id, name, is_group, members:conversation_members ( profile:profiles ( id, name ) )";

/**
 * Finds the existing 1:1 chat with another user. RLS only returns
 * conversations the caller belongs to, so a non-group row whose members
 * include the other user is by definition the pair's direct chat. The
 * inner join also filters the embedded members down to that user, which
 * is all conversationTitle() needs.
 */
export async function findDirectConversation(
  supabase: SupabaseBrowserClient,
  otherUserId: string
): Promise<ConversationHead | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, name, is_group, members:conversation_members!inner ( user_id, profile:profiles ( id, name ) )")
    .eq("is_group", false)
    .eq("members.user_id", otherUserId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as unknown as ConversationHead | null) ?? null;
}

export async function loadConversationHead(
  supabase: SupabaseBrowserClient,
  conversationId: string
): Promise<ConversationHead | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select(HEAD_SELECT)
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as unknown as ConversationHead | null) ?? null;
}

/** Group name, or the other person's name for a 1:1 chat. */
export function conversationTitle(
  conversation: Pick<ConversationHead, "name" | "members"> | null | undefined,
  currentUserId: string
): string {
  if (!conversation) return "this conversation";
  if (conversation.name) return conversation.name;

  const other = conversation.members
    .map((m) => m.profile)
    .find((p) => p && p.id !== currentUserId);
  return other?.name || "this conversation";
}
