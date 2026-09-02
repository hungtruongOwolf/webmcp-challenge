"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isThisWeek } from "date-fns";

import useOtherUser from "@/app/hooks/use-other-user";
import type { FullConversationType } from "@/app/types";
import { useCurrentUser } from "@/app/context/current-user-context";
import Avatar from "@/app/components/avatar";
import AvatarGroup from "@/app/components/avatar-group";

type ConversationBoxProps = {
  data: FullConversationType;
  selected?: boolean;
};

const ConversationBox: React.FC<ConversationBoxProps> = ({ data, selected }) => {
  const otherUser = useOtherUser(data);
  const currentUser = useCurrentUser();
  const router = useRouter();

  const handleClick = useCallback(() => {
    router.push(`/conversations/${data.id}`);
  }, [data.id, router]);

  const lastMessage = useMemo(() => {
    const messages = data.messages || [];

    return messages[messages.length - 1];
  }, [data.messages]);

  const myEmail = currentUser?.email;

  const unreadCount = useMemo(() => {
    if (!myEmail) return 0;

    return (data.messages || []).filter(
      (m) =>
        m.sender?.email !== myEmail &&
        !m.seen.some((u) => u.email === myEmail)
    ).length;
  }, [data.messages, myEmail]);

  const isUnread = unreadCount > 0;

  const lastMessageText = useMemo(() => {
    if (lastMessage?.deleted_at) return "Message deleted";
    if (lastMessage?.image) return "Sent an image";
    if (lastMessage?.file_url) return `Sent a file: ${lastMessage.file_name || "attachment"}`;
    if (lastMessage?.body) return lastMessage.body;

    return "Started a conversation";
  }, [lastMessage]);

  const timeLabel = useMemo(() => {
    if (!lastMessage?.created_at) return "";

    const d = new Date(lastMessage.created_at);
    if (isToday(d)) return format(d, "p");
    if (isThisWeek(d)) return format(d, "EEEE");

    return format(d, "d MMM");
  }, [lastMessage]);

  const title = data.name || otherUser?.name || "Unknown";

  return (
    <button
      type="button"
      role="listitem"
      onClick={handleClick}
      aria-current={selected}
      className="gm-row"
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: 10,
        border: "none",
        borderRadius: 10,
        background: selected ? "var(--sel)" : "transparent",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      {data.is_group ? (
        <AvatarGroup users={data.users} />
      ) : (
        <Avatar user={otherUser} />
      )}
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span
          style={{
            fontSize: 14.5,
            fontWeight: isUnread ? 700 : 500,
            letterSpacing: "-0.008em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: isUnread ? 600 : 400,
            color: isUnread ? "var(--t1)" : "var(--t3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {lastMessageText}
        </span>
      </span>
      <span style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--t3)" }}>{timeLabel}</span>
        {isUnread && (
          <span
            aria-label={`${unreadCount} unread`}
            style={{
              minWidth: 19,
              height: 19,
              padding: "0 5px",
              borderRadius: 6,
              background: "var(--accent)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              display: "grid",
              placeItems: "center",
            }}
          >
            {unreadCount}
          </span>
        )}
      </span>
    </button>
  );
};

export default ConversationBox;
