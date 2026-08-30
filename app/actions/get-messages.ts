import { createClient } from "@/app/libs/supabase/server";
import type { FullMessageType } from "@/app/types";

/**
 * Messages in a conversation, oldest first.
 *
 * Previously this had no authorization check at all. It still has none --
 * it does not need one, because the RLS policy on messages returns nothing
 * for a conversation you are not a member of.
 */
const getMessages = async (conversationId: string) => {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("messages")
      .select(
        `*, sender:profiles!messages_sender_id_fkey (*), seen:message_seen ( profile:profiles!message_seen_user_id_fkey (*) )`,
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return (data ?? []).map((message: any) => ({
      ...message,
      seen: (message.seen ?? []).map((s: any) => s.profile),
    })) as unknown as FullMessageType[];
  } catch {
    return [];
  }
};

export default getMessages;
