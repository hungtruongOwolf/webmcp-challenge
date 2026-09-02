"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { find } from "lodash";
import type { Conversation, User } from "@/app/types";

import type { FullMessageType } from "@/app/types";
import useConversation from "@/app/hooks/use-conversation";
import { createClient } from "@/app/libs/supabase/client";
import Header from "./header";
import Body from "./body";
import Form from "./form";
import ProfileDrawer from "./profile-drawer";
import Lightbox from "./lightbox";

type ThreadProps = {
  conversation: Conversation & { users: User[] };
  initialMessages: FullMessageType[];
};

const Thread: React.FC<ThreadProps> = ({ conversation, initialMessages }) => {
  const [messages, setMessages] = useState(initialMessages);
  const [members, setMembers] = useState<User[]>(conversation.users);
  const membersRef = useRef(members);
  const [drawer, setDrawer] = useState<"media" | "people" | "settings" | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const { conversationId } = useConversation();

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    setMessages(initialMessages);
    setMembers(conversation.users);
    // Only re-syncs on navigation to a (possibly different) conversation --
    // this conversation's own realtime channel below is the source of
    // truth for messages/members from then on. Re-running this on every
    // background initialMessages/conversation.users prop update (which
    // ConversationsContext's sidebar refetch produces on every message,
    // redundantly with what the channel below already applied) was
    // clobbering local state with an equivalent copy on every message --
    // harmless, but a source of avoidable re-render flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    axios.post(`/api/conversations/${conversationId}/seen`);
  }, [conversationId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`conversation:${conversationId}`, {
      config: { private: true },
    });

    const findUser = (id: string) => membersRef.current.find((u) => u.id === id);

    channel
      .on("broadcast", { event: "*" }, ({ payload }) => {
        const table = payload?.table;

        if (table === "messages" && payload.record) {
          const record = payload.record;

          setMessages((current) => {
            if (find(current, { id: record.id })) {
              // An edit or soft-delete arrives as an UPDATE on a message id
              // already in state -- merge the changed columns in instead of
              // dropping the event, so edits/deletes actually show live.
              return current.map((m) => (m.id === record.id ? { ...m, ...record } : m));
            }

            // An UPDATE for a message id not yet in state (e.g. an edit that
            // raced the initial page load) has no sender/seen/reactions to
            // hydrate -- only a real INSERT should be appended as new.
            if (payload.operation !== "INSERT") return current;

            const sender = findUser(record.sender_id);
            if (!sender) return current;

            return [...current, { ...record, sender, seen: [], reactions: [] } as FullMessageType];
          });

          if (payload.record.sender_id) {
            axios.post(`/api/conversations/${conversationId}/seen`);
          }
        } else if (table === "message_seen" && payload.record) {
          const { message_id, user_id } = payload.record;
          const seer = findUser(user_id);
          if (!seer) return;

          setMessages((current) =>
            current.map((m) => {
              if (m.id !== message_id) return m;
              if (m.seen.some((u) => u.id === user_id)) return m;

              return { ...m, seen: [...m.seen, seer] };
            })
          );
        } else if (table === "message_reactions") {
          const record = payload.record ?? payload.old_record;
          if (!record) return;

          const { message_id, user_id } = record;
          const reactor = findUser(user_id);
          if (!reactor) return;

          setMessages((current) =>
            current.map((m) => {
              if (m.id !== message_id) return m;

              const withoutReactor = m.reactions.filter((r) => r.user.id !== user_id);

              if (!payload.record) return { ...m, reactions: withoutReactor };

              return {
                ...m,
                reactions: [...withoutReactor, { ...payload.record, user: reactor }],
              };
            })
          );
        } else if (table === "conversation_members" && payload.operation === "DELETE") {
          const removedId = payload.old_record?.user_id;
          if (!removedId) return;

          setMembers((current) => current.filter((u) => u.id !== removedId));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const liveConversation = { ...conversation, users: members };

  return (
    <main
      id="thread"
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <Header
        conversation={liveConversation}
        onOpenMedia={() => setDrawer(drawer === "media" ? null : "media")}
        onOpenInfo={() => setDrawer(drawer === "people" ? null : "people")}
      />
      <Body messages={messages} onOpenImage={setLightboxSrc} />
      <Form />

      <ProfileDrawer
        conversation={liveConversation}
        messages={messages}
        tab={drawer}
        onClose={() => setDrawer(null)}
        onOpenImage={setLightboxSrc}
      />
      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </main>
  );
};

export default Thread;
