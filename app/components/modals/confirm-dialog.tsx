"use client";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  isLoading,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      className="gm-glass3"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 28,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--scrim)",
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="gm-glass2"
        style={{
          width: "100%",
          maxWidth: 380,
          padding: 24,
          borderRadius: 22,
          boxShadow: "var(--e2), inset 0 1px 0 var(--hi)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.015em" }}>{title}</h2>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--t2)" }}>{body}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            style={{
              height: 36,
              padding: "0 14px",
              border: "none",
              borderRadius: 10,
              background: "var(--hover)",
              color: "var(--t1)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              height: 36,
              padding: "0 14px",
              border: "none",
              borderRadius: 10,
              background: "var(--accent)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: isLoading ? "default" : "pointer",
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
