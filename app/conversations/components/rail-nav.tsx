"use client";

import { useRouter } from "next/navigation";
import type { User } from "@/app/types";
import { HiChatBubbleLeftRight, HiUserGroup, HiMoon, HiSun } from "react-icons/hi2";

import useConversation from "@/app/hooks/use-conversation";
import { useUiSettings } from "@/app/context/ui-settings-context";
import Avatar from "@/app/components/avatar";

type RailNavProps = {
  currentUser: User;
  showRail: boolean;
  onOpenDirectory: () => void;
  onOpenProfile: () => void;
};

const RailNav: React.FC<RailNavProps> = ({
  currentUser,
  showRail,
  onOpenDirectory,
  onOpenProfile,
}) => {
  const router = useRouter();
  const { isOpen } = useConversation();
  const { theme, toggleTheme } = useUiSettings();

  if (!showRail) return null;

  return (
    <nav
      aria-label="Main"
      className="gm-glass1 gm-rail"
      style={{
        flex: "none",
        width: 72,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "16px 0",
        boxShadow: "inset -1px 0 0 var(--hair), inset 0 1px 0 var(--hi)",
      }}
    >
      <button
        type="button"
        aria-label="Chats"
        aria-current="page"
        onClick={() => router.push("/conversations")}
        style={{
          width: 44,
          height: 44,
          border: "none",
          borderRadius: 10,
          background: !isOpen ? "var(--sel)" : "transparent",
          color: !isOpen ? "var(--accent-t)" : "var(--t2)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }}
      >
        <HiChatBubbleLeftRight size={21} />
      </button>
      <button
        type="button"
        aria-label="Directory"
        onClick={onOpenDirectory}
        className="gm-icon-btn"
        style={{ width: 44, height: 44 }}
      >
        <HiUserGroup size={21} />
      </button>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        onClick={toggleTheme}
        className="gm-icon-btn"
        style={{ width: 44, height: 44 }}
      >
        {theme === "dark" ? <HiSun size={20} /> : <HiMoon size={20} />}
      </button>
      <button
        type="button"
        aria-label="Your profile"
        onClick={onOpenProfile}
        style={{
          width: 44,
          height: 44,
          border: "none",
          borderRadius: 999,
          background: "transparent",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }}
      >
        <Avatar user={currentUser} size={32} />
      </button>
    </nav>
  );
};

export default RailNav;
