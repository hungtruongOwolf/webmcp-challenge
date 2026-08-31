"use client";

import { useEffect, useMemo, useRef } from "react";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { HiOutlineDocument, HiOutlineArrowDownTray } from "react-icons/hi2";

import type { FullMessageType } from "@/app/types";
import { useCurrentUser } from "@/app/context/current-user-context";
import { useUiSettings } from "@/app/context/ui-settings-context";
import { avatarColors, initialsFromName } from "@/app/libs/avatar-color";
import { createClient } from "@/app/libs/supabase/client";
import Avatar from "@/app/components/avatar";
import MessageReactions from "./message-reactions";

function formatBytes(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type BodyProps = {
  messages: FullMessageType[];
  onOpenImage: (src: string) => void;
};

function dayLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisWeek(date)) return format(date, "EEEE");

  return format(date, "d MMMM yyyy");
}

const Body: React.FC<BodyProps> = ({ messages, onOpenImage }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentUser = useCurrentUser();
  const { theme } = useUiSettings();

  const myEmail = currentUser?.email;

  useEffect(() => {
    bottomRef?.current?.scrollIntoView();
  }, [messages.length]);

  const handleReact = (message: FullMessageType, emoji: string) => {
    if (!currentUser) return;

    const supabase = createClient();
    const mine = message.reactions.find((r) => r.user.id === currentUser.id);

    if (mine?.emoji === emoji) {
      supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", message.id)
        .eq("user_id", currentUser.id)
        .then(() => {});
    } else {
      supabase
        .from("message_reactions")
        .upsert(
          { message_id: message.id, user_id: currentUser.id, emoji },
          { onConflict: "message_id,user_id" }
        )
        .then(() => {});
    }
  };

  const dayGroups = useMemo(() => {
    const days: { label: string; groups: FullMessageType[][] }[] = [];

    for (const message of messages) {
      const created = new Date(message.created_at);
      const label = dayLabel(created);
      let day = days[days.length - 1];

      if (!day || day.label !== label) {
        day = { label, groups: [] };
        days.push(day);
      }

      const lastGroup = day.groups[day.groups.length - 1];
      if (lastGroup && lastGroup[0].sender_id === message.sender_id) {
        lastGroup.push(message);
      } else {
        day.groups.push([message]);
      }
    }

    return days;
  }, [messages]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Messages"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "20px 20px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column" }}>
        {messages.length === 0 && (
          <div style={{ padding: "64px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>No messages yet</span>
            <span style={{ maxWidth: "38ch", fontSize: 14, lineHeight: 1.55, color: "var(--t2)" }}>
              Say hello to get things started.
            </span>
          </div>
        )}

        {dayGroups.map((day) => (
          <div key={day.label} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 0 20px", display: "flex", justifyContent: "center" }}>
              <span style={{ padding: "5px 11px", borderRadius: 6, background: "var(--hover)", fontSize: 11.5, fontWeight: 600, color: "var(--t2)" }}>
                {day.label}
              </span>
            </div>

            {day.groups.map((group) => {
              const sender = group[0].sender;
              const isOwn = sender.email === myEmail;
              const last = group[group.length - 1];
              const seenBy = (last.seen || []).filter((u) => u.email !== sender.email);

              return (
                <article
                  key={group[0].id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px minmax(0,1fr)",
                    gap: 10,
                    marginBottom: "var(--gap-group)",
                    justifyItems: isOwn ? "end" : "start",
                  }}
                >
                  <div style={{ gridColumn: 1, alignSelf: "end", width: 32, height: 32 }}>
                    {!isOwn && <Avatar user={sender} size={32} showStatus={false} />}
                  </div>
                  <div
                    style={{
                      gridColumn: 2,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      alignItems: isOwn ? "flex-end" : "flex-start",
                    }}
                  >
                    {!isOwn && (
                      <span style={{ padding: "0 4px 3px", fontSize: 12, fontWeight: 500, color: "var(--t3)" }}>
                        {sender.name}
                      </span>
                    )}
                    {group.map((message, i) => {
                      const radius = isOwn
                        ? i === group.length - 1
                          ? "16px 16px 6px 16px"
                          : "16px 16px 16px 16px"
                        : i === group.length - 1
                          ? "16px 16px 16px 6px"
                          : "16px 16px 16px 16px";

                      return (
                        <div
                          key={message.id}
                          className="gm-msg-row"
                          style={{ width: "auto", maxWidth: "78%", display: "flex", flexDirection: "column", gap: 3, alignItems: isOwn ? "flex-end" : "flex-start" }}
                        >
                          {message.image ? (
                            <button
                              type="button"
                              onClick={() => onOpenImage(message.image!)}
                              aria-label="Open photo"
                              style={{
                                display: "block",
                                padding: 0,
                                border: "none",
                                borderRadius: radius,
                                overflow: "hidden",
                                cursor: "zoom-in",
                                background: "var(--bub-in)",
                                boxShadow: "0 0 0 0.5px var(--hair)",
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={message.image}
                                alt="Shared"
                                style={{ display: "block", maxWidth: 260, maxHeight: 320, objectFit: "cover" }}
                              />
                            </button>
                          ) : message.file_url ? (
                            <a
                              href={message.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "grid",
                                gridTemplateColumns: "36px 1fr auto",
                                alignItems: "center",
                                gap: 10,
                                width: 240,
                                padding: "10px 12px",
                                borderRadius: radius,
                                background: isOwn ? "var(--bub-out)" : "var(--bub-in)",
                                color: isOwn ? "var(--bub-out-t)" : "var(--bub-in-t)",
                                textDecoration: "none",
                                boxShadow: "0 0 0 0.5px var(--hair)",
                              }}
                            >
                              <span aria-hidden style={{ display: "grid", placeItems: "center" }}>
                                <HiOutlineDocument size={22} />
                              </span>
                              <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {message.file_name || "File"}
                                </span>
                                <span style={{ fontSize: 11.5, opacity: 0.75 }}>{formatBytes(message.file_size)}</span>
                              </span>
                              <HiOutlineArrowDownTray size={16} aria-hidden />
                            </a>
                          ) : (
                            <div
                              style={{
                                padding: "9px 13px",
                                borderRadius: radius,
                                background: isOwn ? "var(--bub-out)" : "var(--bub-in)",
                                color: isOwn ? "var(--bub-out-t)" : "var(--bub-in-t)",
                                fontSize: 15.5,
                                lineHeight: 1.35,
                                letterSpacing: "-0.006em",
                                fontWeight: 400,
                                wordBreak: "break-word",
                                boxShadow: "0 0 0 0.5px var(--hair)",
                              }}
                            >
                              {message.body}
                            </div>
                          )}
                          <MessageReactions
                            message={message}
                            currentUserId={currentUser?.id}
                            isOwn={isOwn}
                            onReact={(emoji) => handleReact(message, emoji)}
                          />
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 4px 0", minHeight: 16 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t3)" }}>
                        {format(new Date(last.created_at), "p")}
                      </span>
                      {isOwn && seenBy.length > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }} title={`Seen by ${seenBy.map((u) => u.name).join(", ")}`}>
                          <span style={{ display: "flex" }}>
                            {seenBy.slice(0, 3).map((u, idx) => {
                              const c = avatarColors(u.name || u.email || "?", theme === "dark");
                              return (
                                <span
                                  key={u.id}
                                  aria-hidden
                                  style={{
                                    width: 16,
                                    height: 16,
                                    marginLeft: idx === 0 ? 0 : -6,
                                    borderRadius: 999,
                                    background: c.bg,
                                    color: c.fg,
                                    fontSize: 8.5,
                                    fontWeight: 600,
                                    display: "grid",
                                    placeItems: "center",
                                    boxShadow: "0 0 0 1.5px var(--l0-mid)",
                                  }}
                                >
                                  {initialsFromName(u.name)}
                                </span>
                              );
                            })}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))}

        <div ref={bottomRef} style={{ height: 4 }} />
      </div>
    </div>
  );
};

export default Body;
