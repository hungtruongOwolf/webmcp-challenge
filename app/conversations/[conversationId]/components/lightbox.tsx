"use client";

type LightboxProps = {
  src: string | null;
  onClose: () => void;
};

const Lightbox: React.FC<LightboxProps> = ({ src, onClose }) => {
  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      onClick={onClose}
      className="gm-glass2"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 26,
        display: "grid",
        placeItems: "center",
        padding: 48,
        background: "var(--scrim)",
      }}
    >
      <div style={{ maxWidth: "min(860px,100%)", width: "100%", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Shared"
          style={{ width: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 22, boxShadow: "var(--e2)" }}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "8px 16px",
            border: "none",
            borderRadius: 999,
            background: "var(--s2)",
            color: "var(--t1)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default Lightbox;
