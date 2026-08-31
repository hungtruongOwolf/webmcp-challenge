"use client";

import { useMemo, useState } from "react";
import { HiUserPlus, HiPlus, HiMagnifyingGlass } from "react-icons/hi2";

import type { User } from "@/app/types";
import useConversation from "@/app/hooks/use-conversation";
import { useConversationsList } from "@/app/context/conversations-context";
import ConversationBox from "@/app/conversations/components/conversation-box";

type ConversationListProps = {
  users: User[];
  showList: boolean;
  onOpenDirectory: () => void;
  onOpenNewGroup: () => void;
};

const ConversationList: React.FC<ConversationListProps> = ({
  showList,
  onOpenDirectory,
  onOpenNewGroup,
}) => {
  const { conversations } = useConversationsList();
  const [query, setQuery] = useState("");

  const { conversationId, isOpen } = useConversation();

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
