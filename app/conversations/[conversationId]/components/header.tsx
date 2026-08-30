"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Conversation, User } from "@/app/types";
import { HiArrowLeft, HiOutlinePhoto, HiOutlineInformationCircle } from "react-icons/hi2";

import useOtherUser from "@/app/hooks/use-other-user";
import useActiveList from "@/app/hooks/use-active-list";
import AvatarGroup from "@/app/components/avatar-group";
import Avatar from "@/app/components/avatar";

type HeaderProps = {
  conversation: Conversation & { users: User[] };
  onOpenMedia: () => void;
  onOpenInfo: () => void;
};

const Header: React.FC<HeaderProps> = ({ conversation, onOpenMedia, onOpenInfo }) => {
  const otherUser = useOtherUser(conversation);
  const { members } = useActiveList();
  const isActive = members.indexOf(otherUser?.id!) !== -1;

  const statusText = useMemo(() => {
    if (conversation.is_group) return `${conversation.users.length} members`;

    return isActive ? "Online" : "Offline";
  }, [conversation, isActive]);

  return (
    <header
      className="gm-glass1"
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        boxShadow: "inset 0 1px 0 var(--hi), inset 0 -1px 0 var(--hair)",
        zIndex: 3,
      }}
    >
      <Link
        href="/conversations"
        aria-label="Back to chats"
        className="gm-icon-btn"
        style={{
          width: 40,
          height: 40,
          flex: "none",
          display: "grid",
          placeItems: "center",
        }}
      >
        <HiArrowLeft size={18} />
      </Link>
      {conversation.is_group ? (
        <AvatarGroup users={conversation.users} size={38} />
      ) : (
        <Avatar user={otherUser} size={38} />
      )}
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontSize: 16.5,
            fontWeight: 600,
            letterSpacing: "-0.014em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {conversation.name || otherUser?.name}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: isActive ? "var(--lagoon)" : "var(--t3)" }}>
          {statusText}
        </span>
      </span>
      <span style={{ flex: 1 }} />
      <button
        type="button"
        aria-label="Shared photos"
        onClick={onOpenMedia}
        className="gm-icon-btn"
        style={{ width: 38, height: 38 }}
      >
        <HiOutlinePhoto size={18} />
      </button>
      <button
        type="button"
        aria-label="Chat details"
        onClick={onOpenInfo}
        className="gm-icon-btn"
        style={{ width: 38, height: 38 }}
      >
        <HiOutlineInformationCircle size={18} />
      </button>
    </header>
  );
};

export default Header;
