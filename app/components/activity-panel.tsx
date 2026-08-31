"use client";

import { HiXMark, HiCheckCircle, HiXCircle, HiWrenchScrewdriver } from "react-icons/hi2";

import { useWebmcpActivity } from "@/app/context/webmcp-activity-context";
import { relativeTime } from "@/lib/webmcp/budget";

type ActivityPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

const statusIcon = (kind: string, status?: string) => {
  if (kind === "registered") return <HiWrenchScrewdriver size={16} style={{ color: "var(--t3)" }} />;
  if (status === "error") return <HiXCircle size={16} style={{ color: "#e5484d" }} />;
  return <HiCheckCircle size={16} style={{ color: "var(--accent)" }} />;
};

const ActivityPanel: React.FC<ActivityPanelProps> = ({ isOpen, onClose }) => {
  const { events, enabled } = useWebmcpActivity();

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="gm-glass3"
      style={{ position: "absolute", inset: 0, zIndex: 24, display: "flex", justifyContent: "flex-end", background: "var(--scrim)" }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="WebMCP tool activity"
        onClick={(e) => e.stopPropagation()}
        className="gm-glass1"
        style={{
          width: "min(380px, 92vw)",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--e2)",
        }}
      >
        <div style={{ flex: "none", padding: "20px 20px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.015em" }}>
              Tool activity
            </h2>
            <button type="button" aria-label="Close" onClick={onClose} className="gm-icon-btn" style={{ width: 32, height: 32 }}>
              <HiXMark size={16} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: enabled ? "var(--accent)" : "var(--t3)",
                flex: "none",
              }}
            />
            <span style={{ fontSize: 12.5, color: "var(--t2)" }}>
              {enabled
                ? `${events.filter((e) => e.kind === "registered").length} tools registered`
                : "WebMCP not detected in this browser"}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 16px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
          {events.length === 0 && (
            <div style={{ padding: "28px 12px", textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>No activity yet</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--t2)" }}>
                Tool calls made by an AI agent on this page will show up here as they happen.
              </span>
            </div>
          )}

          {events.map((event) => (
            <div
              key={event.id}
              style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, padding: "8px 8px", borderRadius: 10 }}
            >
              <span style={{ paddingTop: 2 }}>{statusIcon(event.kind, event.status)}</span>
              <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {event.kind === "registered" ? `Registered ${event.toolName}` : event.toolName}
                  </span>
                  <span style={{ flex: "none", fontSize: 11, color: "var(--t3)" }}>
                    {relativeTime(new Date(event.at).toISOString())}
                  </span>
                </span>
                <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--t2)", wordBreak: "break-word" }}>
                  {event.summary}
                </span>
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

export default ActivityPanel;
