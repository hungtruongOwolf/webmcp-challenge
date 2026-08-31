"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useRouter } from "next/navigation";
import { find } from "lodash";

import type { FullConversationType } from "@/app/types";
import { useCurrentUser } from "@/app/context/current-user-context";
import { createClient } from "@/app/libs/supabase/client";
import useConversation from "@/app/hooks/use-conversation";

const CONVERSATION_SELECT = `id, name, is_group, created_at, last_message_at,
  members:conversation_members ( profile:profiles (*) ),
  messages ( *, sender:profiles!messages_sender_id_fkey (*), seen:message_seen ( profile:profiles!message_seen_user_id_fkey (*) ),
    reactions:message_reactions ( *, user:profiles!message_reactions_user_id_fkey (*) ) )`;

type ConversationsContextValue = {
  conversations: FullConversationType[];
  ensureConversation: (id: string) => void;
};

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

export function ConversationsProvider({
  initialConversations,
  children,
}: PropsWithChildren<{ initialConversations: FullConversationType[] }>) {
  const [conversations, setConversations] = useState(initialConversations);
  const currentUser = useCurrentUser();
  const router = useRouter();
  const { conversationId } = useConversation();

  const fetchAndUpsertConversation = useCallback(async (id: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("conversations")
      .select(CONVERSATION_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (!data) return;

    const full = {
      ...data,
      users: (data.members ?? []).map((m: any) => m.profile),
      messages: (data.messages ?? [])
        .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
        .map((m: any) => ({
          ...m,
          seen: (m.seen ?? []).map((s: any) => s.profile),
          reactions: m.reactions ?? [],
        })),
    } as unknown as FullConversationType;

    setConversations((current) => {
      if (find(current, { id: full.id }))
        return current.map((c) => (c.id === full.id ? full : c));

      return [full, ...current];
    });
  }, []);

  // Only fetches conversations the realtime feed hasn't delivered yet --
  // e.g. the moment right after this tab creates one and navigates to it,
  // before the "user:<uuid>" broadcast for the new membership row arrives.
  const ensureConversation = useCallback(
    (id: string) => {
      setConversations((current) => {
        if (!find(current, { id })) fetchAndUpsertConversation(id);
        return current;
      });
    },
    [fetchAndUpsertConversation]
  );

  useEffect(() => {
    if (!currentUser?.id) return;

    const supabase = createClient();
    const channel = supabase.channel(`user:${currentUser.id}`, {
      config: { private: true },
    });

    channel
      .on("broadcast", { event: "*" }, ({ payload }) => {
        const table = payload?.table;

        if (table === "conversation_members" || table === "messages") {
          fetchAndUpsertConversation(payload.record.conversation_id);
        } else if (table === "conversations") {
          const id = payload.old_record?.id ?? payload.record?.id;

          setConversations((current) => current.filter((c) => c.id !== id));
          if (conversationId === id) router.push("/conversations");
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, conversationId, router, fetchAndUpsertConversation]);

  return (
    <ConversationsContext.Provider value={{ conversations, ensureConversation }}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversationsList() {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error("useConversationsList must be used within a ConversationsProvider");
  }
  return ctx;
}
