"use client";

import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import type { User } from "@/app/types";
import { HiCheck, HiXMark } from "react-icons/hi2";

import Avatar from "@/app/components/avatar";

type GroupChatModalProps = {
  users: User[];
  isOpen: boolean;
  onClose: () => void;
};

const GroupChatModal: React.FC<GroupChatModalProps> = ({ users, isOpen, onClose }) => {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const togglePick = (user: User) => {
    setPicked((current) =>
      current.some((u) => u.id === user.id)
        ? current.filter((u) => u.id !== user.id)
        : [...current, user]
    );
  };

  const close = () => {
    setName("");
    setPicked([]);
    onClose();
  };

  const canCreate = name.trim().length > 0 && picked.length >= 2 && !isLoading;

  const createGroup = () => {
    if (!canCreate) return;

    setIsLoading(true);

    axios
      .post("/api/conversations", {
        name: name.trim(),
        isGroup: true,
        members: picked.map((u) => ({ value: u.id })),
      })
      .then(() => close())
      .catch(() => toast.error("Something went wrong."))
      .finally(() => setIsLoading(false));
  };

  return (
    <div
      role="presentation"
      onClick={close}
      className="gm-glass3"
      style={{ position: "absolute", inset: 0, zIndex: 23, display: "grid", placeItems: "center", padding: 24, background: "var(--scrim)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New group"
        onClick={(e) => e.stopPropagation()}
        className="gm-glass2"
        style={{ width: "100%", maxWidth: 420, maxHeight: "100%", display: "flex", flexDirection: "column", borderRadius: 22, boxShadow: "var(--e2), inset 0 1px 0 var(--hi)", overflow: "hidden" }}
      >
        <div style={{ flex: "none", padding: "20px 20px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.015em" }}>New group</h2>
            <button type="button" aria-label="Close" onClick={close} className="gm-icon-btn" style={{ width: 32, height: 32 }}>
              <HiXMark size={16} />
            </button>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}>Group name</span>
            <input
              type="text"
              placeholder="Thursday dinner"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ height: 38, padding: "0 12px", border: "none", borderRadius: 10, background: "var(--bub-in)", color: "var(--t1)", fontSize: 14, outline: "none", boxShadow: "inset 0 0 0 0.5px var(--hair)" }}
            />
          </label>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}>Add people</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {users.map((p) => {
            const isPicked = picked.some((u) => u.id === p.id);

            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={isPicked}
                onClick={() => togglePick(p)}
                className="gm-row"
                style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12, padding: "9px 8px", border: "none", borderRadius: 10, background: isPicked ? "var(--sel)" : "transparent", textAlign: "left", cursor: "pointer" }}
              >
                <Avatar user={p} size={36} />
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: "var(--t3)" }}>{p.email}</span>
                </span>
                <span
                  aria-hidden
                  style={{ width: 20, height: 20, borderRadius: 6, background: isPicked ? "var(--accent)" : "transparent", color: "#fff", display: "grid", placeItems: "center", boxShadow: "inset 0 0 0 1.5px var(--hair)" }}
                >
                  {isPicked && <HiCheck size={14} />}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ flex: "none", padding: "12px 20px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, boxShadow: "inset 0 1px 0 var(--hair)" }}>
          <span style={{ fontSize: 12, color: "var(--t3)" }}>{picked.length} selected</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={close} style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 10, background: "var(--hover)", color: "var(--t1)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!canCreate}
              onClick={createGroup}
              style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 10, background: canCreate ? "var(--accent)" : "var(--hover)", color: canCreate ? "#fff" : "var(--t3)", fontSize: 13, fontWeight: 600, cursor: canCreate ? "pointer" : "default" }}
            >
              Create group
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupChatModal;
