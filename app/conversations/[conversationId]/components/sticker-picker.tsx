"use client";

import { useEffect, useRef, useState } from "react";
import { HiOutlineFaceSmile } from "react-icons/hi2";

import { STICKER_EMOJI } from "@/app/types";

type StickerPickerProps = {
  disabled?: boolean;
  onPick: (emoji: string) => void;
};

const StickerPicker: React.FC<StickerPickerProps> = ({ disabled, onPick }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Send a sticker"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="gm-icon-btn"
        style={{
          flex: "none",
          width: 44,
          height: 44,
          display: "grid",
          placeItems: "center",
          boxShadow: "inset 0 0 0 0.5px var(--hair)",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <HiOutlineFaceSmile size={19} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choose a sticker"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 2,
            padding: 8,
            width: 230,
            borderRadius: 14,
            background: "var(--l0-top)",
            boxShadow: "var(--e1), 0 0 0 0.5px var(--hair)",
            zIndex: 5,
          }}
        >
          {STICKER_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              aria-label={`Send ${emoji} sticker`}
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              style={{
                width: 40,
                height: 40,
                display: "grid",
                placeItems: "center",
                fontSize: 20,
                lineHeight: 1,
                border: "none",
                borderRadius: 10,
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
    </div>
  );
};

export default StickerPicker;
