"use client";

import { useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { CldUploadButton } from "next-cloudinary";
import { HiPaperAirplane, HiOutlinePhoto } from "react-icons/hi2";

import useConversation from "@/app/hooks/use-conversation";

const Form = () => {
  const { conversationId } = useConversation();
  const [draft, setDraft] = useState("");

  const { handleSubmit, reset } = useForm<FieldValues>({
    defaultValues: { message: "" },
  });

  const onSubmit: SubmitHandler<FieldValues> = () => {
    const message = draft.trim();
    if (!message) return;

    setDraft("");
    reset();

    // The realtime subscription in Thread picks this up for everyone,
    // including the sender -- no local state update needed here.
    axios.post("/api/messages", { message, conversationId });
  };

  const handleUpload = (result: any) => {
    axios.post("/api/messages", { image: result?.info?.secure_url, conversationId });
  };

  return (
    <div
      className="gm-glass2"
      style={{
        flex: "none",
        padding: "12px 20px 16px",
        display: "flex",
        justifyContent: "center",
        boxShadow: "inset 0 1px 0 var(--hi), 0 -1px 0 var(--hair)",
        zIndex: 3,
      }}
    >
      <div style={{ width: "100%", maxWidth: 760, display: "flex", alignItems: "flex-end", gap: 10 }}>
        <CldUploadButton
          options={{ maxFiles: 1, maxFileSize: 4000000 }}
          onUpload={handleUpload}
          uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_PRESET}
        >
          <span
            aria-label="Send a photo"
            className="gm-icon-btn"
            style={{
              width: 44,
              height: 44,
              display: "grid",
              placeItems: "center",
              boxShadow: "inset 0 0 0 0.5px var(--hair)",
            }}
          >
            <HiOutlinePhoto size={19} />
          </span>
        </CldUploadButton>
        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", gap: 10 }}
        >
          <input
            type="text"
            aria-label="Type a message"
            placeholder="Type a message..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              height: 44,
              padding: "0 14px",
              border: "none",
              borderRadius: 10,
              background: "var(--bub-in)",
              color: "var(--t1)",
              fontSize: 15,
              fontWeight: 400,
              outline: "none",
              boxShadow: "inset 0 0 0 0.5px var(--hair)",
            }}
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!draft.trim()}
            style={{
              flex: "none",
              width: 44,
              height: 44,
              border: "none",
              borderRadius: 10,
              background: draft.trim() ? "var(--accent)" : "var(--hover)",
              color: draft.trim() ? "#fff" : "var(--t3)",
              display: "grid",
              placeItems: "center",
              cursor: draft.trim() ? "pointer" : "default",
            }}
          >
            <HiPaperAirplane size={19} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default Form;
