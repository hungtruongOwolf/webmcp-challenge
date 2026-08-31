"use client";

import { useState } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import type { User } from "@/app/types";
import type { PropsWithChildren } from "react";

import type { FullConversationType } from "@/app/types";
import useConversation from "@/app/hooks/use-conversation";
import { UiSettingsProvider, useUiSettings } from "@/app/context/ui-settings-context";
import { OverlayProvider } from "@/app/context/overlay-context";
import { ConversationsProvider } from "@/app/context/conversations-context";
import { WebmcpActivityProvider } from "@/app/context/webmcp-activity-context";
import { ConfirmBridgeProvider } from "@/app/context/confirm-bridge-context";
import { hueFromName } from "@/app/libs/avatar-color";
import WebmcpTools from "@/app/components/webmcp-tools";
import ActivityPanel from "@/app/components/activity-panel";
import RailNav from "./rail-nav";
import ConversationList from "./conversation-list";
import DirectoryModal from "./directory-modal";
import GroupChatModal from "./group-chat-modal";
import ProfileModal from "./profile-modal";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

type Overlay = "directory" | "newGroup" | "profile" | "activity" | null;

type ConversationsShellProps = PropsWithChildren<{
  currentUser: User;
  initialConversations: FullConversationType[];
  users: User[];
}>;

function ShellInner({
  currentUser,
  users,
  children,
}: Omit<ConversationsShellProps, "initialConversations">) {
  const { theme, glass, density } = useUiSettings();
  const { isOpen, conversationId } = useConversation();
  const [overlay, setOverlay] = useState<Overlay>(null);

  const roomHue = hueFromName(conversationId || "default");

  return (
    <OverlayProvider
      value={{
        openProfile: () => setOverlay("profile"),
        openDirectory: () => setOverlay("directory"),
        openNewGroup: () => setOverlay("newGroup"),
      }}
    >
      <div
        className={`gm ${beVietnamPro.className}`}
        data-theme={theme}
        data-glass={glass ? "on" : "off"}
        data-density={density}
        data-thread-open={isOpen}
        style={{
          position: "fixed",
          inset: 0,
          overflow: "hidden",
          // @ts-expect-error custom property
          "--room-hue": roomHue,
        }}
      >
        <div aria-hidden className="gm-bg" />

        <div style={{ position: "relative", zIndex: 1, display: "flex", height: "100%", width: "100%" }}>
          <RailNav
            currentUser={currentUser}
            showRail
            onOpenDirectory={() => setOverlay("directory")}
            onOpenProfile={() => setOverlay("profile")}
            onOpenActivity={() => setOverlay("activity")}
          />

          <ConversationList
            users={users}
            showList
            onOpenDirectory={() => setOverlay("directory")}
            onOpenNewGroup={() => setOverlay("newGroup")}
          />

          <main
            id="main-content"
            tabIndex={-1}
            className="gm-detail-panel"
            style={{ flex: 1, minWidth: 0, display: "flex" }}
          >
            {children}
          </main>
        </div>

        <DirectoryModal
          isOpen={overlay === "directory"}
          onClose={() => setOverlay(null)}
          users={users}
          onOpenNewGroup={() => setOverlay("newGroup")}
        />
        <GroupChatModal
          isOpen={overlay === "newGroup"}
          onClose={() => setOverlay(null)}
          users={users}
        />
        <ProfileModal
          isOpen={overlay === "profile"}
          onClose={() => setOverlay(null)}
          currentUser={currentUser}
        />
        <ActivityPanel isOpen={overlay === "activity"} onClose={() => setOverlay(null)} />

        <WebmcpTools />
      </div>
    </OverlayProvider>
  );
}

const ConversationsShell: React.FC<ConversationsShellProps> = ({
  initialConversations,
  ...props
}) => {
  return (
    <UiSettingsProvider>
      <ConversationsProvider initialConversations={initialConversations}>
        <WebmcpActivityProvider>
          <ConfirmBridgeProvider>
            <ShellInner {...props} />
          </ConfirmBridgeProvider>
        </WebmcpActivityProvider>
      </ConversationsProvider>
    </UiSettingsProvider>
  );
};

export default ConversationsShell;
