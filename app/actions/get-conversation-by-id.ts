import { createClient } from "@/app/libs/supabase/server";

/**
 * One conversation, or null.
 *
 * The membership check that this function was missing before is now the RLS
 * policy: a non-member gets zero rows back, so the caller renders the empty
 * state instead of someone else's chat.
 */
const getConversationById = async (conversationId: string) => {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data, error } = await supabase
      .from("conversations")
      .select(
        `id, name, is_group, created_at, last_message_at,
         members:conversation_members ( profile:profiles (*) )`
      )
      .eq("id", conversationId)
      .maybeSingle();

    if (error || !data) return null;

    const { members, ...conversation } = data as any;

    return {
      ...conversation,
      users: (members ?? []).map((m: any) => m.profile),
    };
  } catch {
    return null;
  }
};

export default getConversationById;
