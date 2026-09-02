"use client";

import { useEffect, useState } from "react";
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
  const [drawer, setDrawer] = useState<"media" | "people" | "settings" | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const { conversationId } = useConversation();

  useEffect(() => {
    setMessages(initialMessages);
  }, [conversationId, initialMessages]);

  useEffect(() => {
    axios.post(`/api/conversations/${conversationId}/seen`);
  }, [conversationId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`conversation:${conversationId}`, {
      config: { private: true },
    });

    const findUser = (id: string) => conversation.users.find((u) => u.id === id);

    channel
      .on("broadcast", { event: "*" }, ({ payload }) => {
        const table = payload?.table;

        if (table === "messages" && payload.record) {
          const record = payload.record;

          setMessages((current) => {
            // An UPDATE (edit or soft delete) carries the whole row; merge it
            // over the one we have so sender/seen/reactions survive.
            if (find(current, { id: record.id })) {
              return current.map((m) => (m.id === record.id ? { ...m, ...record } : m));
            }

            const sender = findUser(record.sender_id);
            if (!sender) return current;

            return [...current, { ...record, sender, seen: [], reactions: [] } as FullMessageType];
          });

          if (payload.record.sender_id && payload.operation === "INSERT") {
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
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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
        conversation={conversation}
        onOpenMedia={() => setDrawer(drawer === "media" ? null : "media")}
        onOpenInfo={() => setDrawer(drawer === "people" ? null : "people")}
      />
      <Body messages={messages} onOpenImage={setLightboxSrc} />
      <Form />

      <ProfileDrawer
        conversation={conversation}
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
