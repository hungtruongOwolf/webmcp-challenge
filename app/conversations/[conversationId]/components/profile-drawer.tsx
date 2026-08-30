"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import type { Conversation, User } from "@/app/types";
import { HiXMark, HiOutlineTrash } from "react-icons/hi2";

import type { FullMessageType } from "@/app/types";
import useActiveList from "@/app/hooks/use-active-list";
import { useUiSettings } from "@/app/context/ui-settings-context";
import { useOverlay } from "@/app/context/overlay-context";
import Avatar from "@/app/components/avatar";
import ConfirmDialog from "@/app/components/modals/confirm-dialog";

type ProfileDrawerProps = {
  conversation: Conversation & { users: User[] };
  messages: FullMessageType[];
  tab: "media" | "people" | "settings" | null;
  onClose: () => void;
  onOpenImage: (src: string) => void;
};

const TABS = [
  { key: "media", label: "Photos" },
  { key: "people", label: "People" },
  { key: "settings", label: "Settings" },
] as const;

const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  conversation,
  messages,
  tab,
  onClose,
  onOpenImage,
}) => {
  const router = useRouter();
  const { members } = useActiveList();
  const { density, setDensity, glass, toggleGlass } = useUiSettings();
  const { openProfile } = useOverlay();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"media" | "people" | "settings">(
    tab || "media"
  );

  useEffect(() => {
    if (tab) setActiveTab(tab);
  }, [tab]);

  const media = useMemo(() => messages.filter((m) => !!m.image), [messages]);

  const onDelete = () => {
    setDeleting(true);

    axios
      .delete(`/api/conversations/${conversation.id}`)
      .then(() => {
        router.push("/conversations");
      })
      .catch(() => toast.error("Something went wrong."))
      .finally(() => {
        setDeleting(false);
        setConfirmDelete(false);
      });
  };

  if (!tab) return null;

  const currentTab = activeTab;

  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 11, background: "var(--scrim)" }} />
      <aside
        aria-label="Chat details"
        className="gm-glass1"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          flex: "none",
          width: "min(360px, 92vw)",
          zIndex: 12,
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--e2)",
        }}
      >
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "12px 12px 8px" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={currentTab === t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1,
                height: 34,
                border: "none",
                borderRadius: 10,
                background: currentTab === t.key ? "var(--sel)" : "transparent",
                color: currentTab === t.key ? "var(--accent-t)" : "var(--t2)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="gm-icon-btn"
            style={{ flex: "none", width: 34, height: 34 }}
          >
            <HiXMark size={16} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 16px 20px" }}>
          {currentTab === "media" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t3)" }}>
                {media.length} photo{media.length === 1 ? "" : "s"}
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                {media.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onOpenImage(m.image!)}
                    aria-label="Open photo"
                    style={{
                      padding: 0,
                      border: "none",
                      borderRadius: 6,
                      overflow: "hidden",
                      aspectRatio: "1",
                      cursor: "zoom-in",
                      boxShadow: "0 0 0 0.5px var(--hair)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.image!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
              {media.length === 0 && (
                <div style={{ padding: "24px 0", display: "flex", flexDirection: "column", gap: 6, textAlign: "center" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>No photos yet</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--t2)" }}>
                    Photos shared in this chat collect here.
                  </span>
                </div>
              )}
            </div>
          )}

          {currentTab === "people" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t3)" }}>
                {conversation.users.length} member{conversation.users.length === 1 ? "" : "s"}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {conversation.users.map((p) => {
                  const online = members.indexOf(p.id) !== -1;

                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderRadius: 10 }}>
                      <Avatar user={p} size={36} />
                      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t3)" }}>
                          {online ? "Online" : "Offline"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentTab === "settings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}>Display</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["compact", "comfortable", "roomy"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={density === d}
                      onClick={() => setDensity(d)}
                      style={{
                        flex: 1,
                        height: 34,
                        border: "none",
                        borderRadius: 10,
                        background: density === d ? "var(--sel)" : "var(--hover)",
                        color: density === d ? "var(--accent-t)" : "var(--t1)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-pressed={glass}
                  onClick={toggleGlass}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    border: "none",
                    borderRadius: 10,
                    background: "var(--hover)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Translucency</span>
                    <span style={{ fontSize: 11.5, color: "var(--t3)" }}>{glass ? "On" : "Off"}</span>
                  </span>
                  <span
                    aria-hidden
                    style={{
                      width: 38,
                      height: 22,
                      borderRadius: 999,
                      background: glass ? "var(--accent)" : "var(--hair)",
                      position: "relative",
                      flex: "none",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: glass ? 18 : 2,
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: "#fff",
                        boxShadow: "0 1px 2px rgba(0,0,0,.2)",
                        transition: "left 200ms var(--ease)",
                      }}
                    />
                  </span>
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}>This chat</span>
                <button
                  type="button"
                  onClick={openProfile}
                  style={{
                    padding: "10px 12px",
                    border: "none",
                    borderRadius: 10,
                    background: "var(--hover)",
                    color: "var(--t1)",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  Your profile
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    border: "none",
                    borderRadius: 10,
                    background: "var(--sel)",
                    color: "var(--accent-t)",
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <HiOutlineTrash size={16} />
                  Delete chat
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete chat"
        body="This removes the conversation for everyone in it. This can't be undone."
        confirmLabel="Delete"
        isLoading={deleting}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
};

export default ProfileDrawer;
