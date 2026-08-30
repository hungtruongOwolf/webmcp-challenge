"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import type { User } from "@/app/types";
import { HiMagnifyingGlass, HiXMark } from "react-icons/hi2";

import useActiveList from "@/app/hooks/use-active-list";
import Avatar from "@/app/components/avatar";

type DirectoryModalProps = {
  users: User[];
  isOpen: boolean;
  onClose: () => void;
  onOpenNewGroup: () => void;
};

const DirectoryModal: React.FC<DirectoryModalProps> = ({
  users,
  isOpen,
  onClose,
  onOpenNewGroup,
}) => {
  const router = useRouter();
  const { members } = useActiveList();
  const [query, setQuery] = useState("");
  const [messagingId, setMessagingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;

    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [users, query]);

  if (!isOpen) return null;

  const message = (user: User) => {
    setMessagingId(user.id);

    axios
      .post("/api/conversations", { userId: user.id })
      .then((res) => {
        router.push(`/conversations/${res.data.id}`);
        onClose();
        setQuery("");
      })
      .finally(() => setMessagingId(null));
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="gm-glass3"
      style={{ position: "absolute", inset: 0, zIndex: 22, display: "grid", placeItems: "center", padding: 24, background: "var(--scrim)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Directory"
        onClick={(e) => e.stopPropagation()}
        className="gm-glass2"
        style={{ width: "100%", maxWidth: 440, maxHeight: "100%", display: "flex", flexDirection: "column", borderRadius: 22, boxShadow: "var(--e2), inset 0 1px 0 var(--hi)", overflow: "hidden" }}
      >
        <div style={{ flex: "none", padding: "20px 20px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.015em" }}>Directory</h2>
            <button type="button" aria-label="Close directory" onClick={onClose} className="gm-icon-btn" style={{ width: 32, height: 32 }}>
              <HiXMark size={16} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 10px", borderRadius: 10, background: "var(--bub-in)", boxShadow: "inset 0 0 0 0.5px var(--hair)" }}>
            <HiMagnifyingGlass size={15} style={{ color: "var(--t3)", flex: "none" }} />
            <input
              type="text"
              aria-label="Search by name or email"
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 14, color: "var(--t1)", outline: "none" }}
            />
          </div>
        </div>
        <div role="list" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {filtered.map((p) => {
            const online = members.indexOf(p.id) !== -1;

            return (
              <div key={p.id} role="listitem" className="gm-row" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12, padding: "9px 8px", borderRadius: 10 }}>
                <Avatar user={p} size={40} showStatus={online} />
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.email}</span>
                </span>
                <button
                  type="button"
                  onClick={() => message(p)}
                  disabled={messagingId === p.id}
                  style={{ flex: "none", height: 32, padding: "0 12px", border: "none", borderRadius: 10, background: "var(--sel)", color: "var(--accent-t)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                >
                  Message
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: "28px 12px", textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>No one matches that</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--t2)" }}>Check the spelling, or search by email instead.</span>
            </div>
          )}
        </div>
        <div style={{ flex: "none", padding: "12px 20px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, boxShadow: "inset 0 1px 0 var(--hair)" }}>
          <span style={{ fontSize: 12, color: "var(--t3)" }}>{users.length} people</span>
          <button type="button" onClick={onOpenNewGroup} style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 10, background: "var(--hover)", color: "var(--t1)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            New group
          </button>
        </div>
      </div>
    </div>
  );
};

export default DirectoryModal;
