"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { find } from "lodash";
import { HiUserPlus, HiPlus, HiMagnifyingGlass } from "react-icons/hi2";

import type { FullConversationType } from "@/app/types";
import type { User } from "@/app/types";
import useConversation from "@/app/hooks/use-conversation";
import { useCurrentUser } from "@/app/context/current-user-context";
import { createClient } from "@/app/libs/supabase/client";
import ConversationBox from "@/app/conversations/components/conversation-box";

type ConversationListProps = {
  initialConversations: FullConversationType[];
  users: User[];
  showList: boolean;
  onOpenDirectory: () => void;
  onOpenNewGroup: () => void;
};

const ConversationList: React.FC<ConversationListProps> = ({
  initialConversations,
  showList,
  onOpenDirectory,
  onOpenNewGroup,
}) => {
  const [conversations, setConversations] = useState(initialConversations);
  const [query, setQuery] = useState("");

  const currentUser = useCurrentUser();
  const router = useRouter();
  const { conversationId, isOpen } = useConversation();

  useEffect(() => {
    if (!currentUser?.id) return;

    const supabase = createClient();
    const channel = supabase.channel(`user:${currentUser.id}`, {
      config: { private: true },
    });

    const fetchAndUpsertConversation = async (id: string) => {
      const { data } = await supabase
        .from("conversations")
        .select(
          `id, name, is_group, created_at, last_message_at,
           members:conversation_members ( profile:profiles (*) ),
           messages ( *, sender:profiles!messages_sender_id_fkey (*), seen:message_seen ( profile:profiles!message_seen_user_id_fkey (*) ) )`
        )
        .eq("id", id)
        .maybeSingle();

      if (!data) return;

      const full = {
        ...data,
        users: (data.members ?? []).map((m: any) => m.profile),
        messages: (data.messages ?? [])
          .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
          .map((m: any) => ({ ...m, seen: (m.seen ?? []).map((s: any) => s.profile) })),
      } as unknown as FullConversationType;

      setConversations((current) => {
        if (find(current, { id: full.id }))
          return current.map((c) => (c.id === full.id ? full : c));

        return [full, ...current];
      });
    };

    channel
      .on("broadcast", { event: "*" }, ({ payload }) => {
        const table = payload?.table;

        if (table === "conversation_members") {
          fetchAndUpsertConversation(payload.record.conversation_id);
        } else if (table === "messages") {
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
  }, [currentUser?.id, conversationId, router]);

  const filtered = useMemo(() => {
    const sorted = [...conversations].sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );

    const q = query.trim().toLowerCase();
    if (!q) return sorted;

    return sorted.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const memberNames = c.users.map((u) => (u.name || "").toLowerCase());

      return name.includes(q) || memberNames.some((n) => n.includes(q));
    });
  }, [conversations, query]);

  if (!showList) return null;

  return (
    <div
      className="gm-glass1 gm-list-panel"
      style={{
        flex: isOpen ? "0 0 320px" : "1 1 320px",
        maxWidth: 380,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        boxShadow: "inset -1px 0 0 var(--hair), inset 0 1px 0 var(--hi)",
      }}
    >
      <div style={{ flex: "none", padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Chats
          </h1>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              aria-label="New group"
              onClick={onOpenNewGroup}
              className="gm-icon-btn"
              style={{ width: 32, height: 32 }}
            >
              <HiUserPlus size={17} />
            </button>
            <button
              type="button"
              aria-label="New chat"
              onClick={onOpenDirectory}
              className="gm-icon-btn"
              style={{ width: 32, height: 32 }}
            >
              <HiPlus size={17} />
            </button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 36,
            padding: "0 10px",
            borderRadius: 10,
            background: "var(--hover)",
            boxShadow: "inset 0 0 0 0.5px var(--hair)",
          }}
        >
          <HiMagnifyingGlass size={15} style={{ color: "var(--t3)", flex: "none" }} />
          <input
            type="text"
            aria-label="Search chats"
            placeholder="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              background: "transparent",
              fontSize: 13.5,
              fontWeight: 500,
              color: "var(--t1)",
              outline: "none",
            }}
          />
        </div>
      </div>
      <div
        role="list"
        aria-label="Conversations"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "0 8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {filtered.map((conversation) => (
          <ConversationBox
            key={conversation.id}
            data={conversation}
            selected={conversationId === conversation.id}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "28px 12px", textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Nothing found</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--t2)" }}>
              Try another name, or open the directory to start a new chat.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationList;
