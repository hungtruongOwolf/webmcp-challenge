import { createClient } from "@/app/libs/supabase/server";
import type { FullConversationType } from "@/app/types";

/**
 * Every conversation you belong to, newest activity first.
 *
 * There is no "where am I a member" clause here on purpose -- the RLS policy
 * on conversations already restricts the rows to ones you belong to. The
 * join tables are flattened back into the users[] / messages[] shape the
 * component tree expects.
 */
const getConversations = async () => {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
      .from("conversations")
      .select(
        `id, name, is_group, created_at, last_message_at,
         members:conversation_members ( profile:profiles (*) ),
         messages ( *, sender:profiles!messages_sender_id_fkey (*), seen:message_seen ( profile:profiles!message_seen_user_id_fkey (*) ),
           reactions:message_reactions ( *, user:profiles!message_reactions_user_id_fkey (*) ) )`
      )
      .order("last_message_at", { ascending: false });

    if (error) throw error;

    return (data ?? []).map((conversation: any) => ({
      ...conversation,
      users: (conversation.members ?? []).map((m: any) => m.profile),
      messages: (conversation.messages ?? [])
        .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
        .map((message: any) => ({
          ...message,
          seen: (message.seen ?? []).map((s: any) => s.profile),
          reactions: message.reactions ?? [],
        })),
    })) as unknown as FullConversationType[];
  } catch {
    return [];
  }
};

export default getConversations;
