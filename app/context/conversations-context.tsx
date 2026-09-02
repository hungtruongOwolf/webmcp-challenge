"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  /**
   * Screen-reader-only announcement for a message that just arrived in a
   * conversation the user isn't currently looking at -- body.tsx's own
   * aria-live log already covers the open thread, so this is specifically
   * for "you got something new somewhere else," the case a blind user has
   * no other way to notice (no visual badge, and the WebMCP agent only
   * runs when asked -- there's no page-initiated push into ChatGPT Voice).
   */
  newMessageAnnouncement: string;
};

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

export function ConversationsProvider({
  initialConversations,
  children,
}: PropsWithChildren<{ initialConversations: FullConversationType[] }>) {
  const [conversations, setConversations] = useState(initialConversations);
  const [newMessageAnnouncement, setNewMessageAnnouncement] = useState("");
  const currentUser = useCurrentUser();
  const router = useRouter();
  const { conversationId } = useConversation();

  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

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

        if (table === "messages" && payload.record) {
          const record = payload.record;
          const isFromSomeoneElse = record.sender_id !== currentUser.id;
          const isElsewhere = record.conversation_id !== conversationIdRef.current;
          // Only a genuine insert has no old_record: edits, deletions, and
          // the read-receipt trigger (which re-broadcasts an existing row)
          // all carry one and must not be announced as new messages.
          const isNewMessage = payload.operation !== "UPDATE" && !payload.old_record;

          if (isFromSomeoneElse && isElsewhere && isNewMessage) {
            const convo = conversationsRef.current.find(
              (c) => c.id === record.conversation_id
            );
            const sender = convo?.users.find((u) => u.id === record.sender_id);
            const preview = record.body?.trim()
              ? record.body.trim()
              : record.image
                ? "sent a photo"
                : record.file_name
                  ? `sent a file: ${record.file_name}`
                  : "sent a message";

            setNewMessageAnnouncement(
              `New message from ${sender?.name ?? "someone"}: ${preview}`
            );
          }

          fetchAndUpsertConversation(record.conversation_id);
        } else if (table === "conversation_members") {
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
    <ConversationsContext.Provider
      value={{ conversations, ensureConversation, newMessageAnnouncement }}
    >
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
