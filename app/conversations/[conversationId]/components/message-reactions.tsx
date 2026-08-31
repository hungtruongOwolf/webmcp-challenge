"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineFaceSmile } from "react-icons/hi2";

import type { FullMessageType } from "@/app/types";
import { REACTION_EMOJI } from "@/app/types";

type MessageReactionsProps = {
  message: FullMessageType;
  currentUserId?: string;
  isOwn: boolean;
  onReact: (emoji: string) => void;
};

const MessageReactions: React.FC<MessageReactionsProps> = ({
  message,
  currentUserId,
  isOwn,
  onReact,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;

    const onOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };

    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [pickerOpen]);

  const grouped = useMemo(() => {
    const order: string[] = [];
    const counts = new Map<string, { count: number; mine: boolean }>();

    for (const r of message.reactions) {
      if (!counts.has(r.emoji)) {
        order.push(r.emoji);
        counts.set(r.emoji, { count: 0, mine: false });
      }
      const entry = counts.get(r.emoji)!;
      entry.count += 1;
      if (r.user.id === currentUserId) entry.mine = true;
    }

    return order.map((emoji) => ({ emoji, ...counts.get(emoji)! }));
  }, [message.reactions, currentUserId]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 4,
        justifyContent: isOwn ? "flex-end" : "flex-start",
      }}
    >
      <button
        type="button"
        aria-label="Add reaction"
        aria-expanded={pickerOpen}
        onClick={() => setPickerOpen((v) => !v)}
        className={`gm-react-trigger${pickerOpen ? " is-open" : ""}`}
        style={{
          width: 22,
          height: 22,
          display: "grid",
          placeItems: "center",
          border: "none",
          borderRadius: 999,
          background: "transparent",
          color: "var(--t3)",
          cursor: "pointer",
        }}
      >
        <HiOutlineFaceSmile size={14} />
      </button>

      {pickerOpen && (
        <div
          role="menu"
          aria-label="Choose a reaction"
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            [isOwn ? "right" : "left"]: 0,
            display: "flex",
            gap: 2,
            padding: 5,
            borderRadius: 999,
            background: "var(--l0-top)",
            boxShadow: "var(--e1), 0 0 0 0.5px var(--hair)",
            zIndex: 5,
          }}
        >
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              aria-label={`React with ${emoji}`}
              onClick={() => {
                onReact(emoji);
                setPickerOpen(false);
              }}
              style={{
                width: 30,
                height: 30,
                display: "grid",
                placeItems: "center",
                fontSize: 17,
                lineHeight: 1,
                border: "none",
                borderRadius: 999,
                background: "transparent",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {grouped.map(({ emoji, count, mine }) => (
        <button
          key={emoji}
          type="button"
          className="gm-react-pill"
          onClick={() => onReact(emoji)}
          aria-label={`${emoji}${count > 1 ? ` × ${count}` : ""}${mine ? ", reacted by you -- click to remove" : ", click to react"}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            padding: "1px 7px",
            fontSize: 12.5,
            lineHeight: 1.6,
            borderRadius: 999,
            cursor: "pointer",
            background: mine ? "var(--sel)" : "var(--hover)",
            border: mine ? "1px solid var(--accent-t)" : "1px solid transparent",
            color: "var(--t2)",
          }}
        >
          <span aria-hidden>{emoji}</span>
          {count > 1 && <span style={{ fontWeight: 600 }}>{count}</span>}
        </button>
      ))}
    </div>
  );
};

export default MessageReactions;
