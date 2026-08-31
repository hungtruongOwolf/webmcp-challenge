"use client";

import { useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { HiPaperAirplane, HiOutlinePhoto, HiOutlinePaperClip } from "react-icons/hi2";

import useConversation from "@/app/hooks/use-conversation";
import { createClient } from "@/app/libs/supabase/client";
import { uploadChatImage, uploadChatFile } from "@/app/libs/supabase/upload";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const Form = () => {
  const { conversationId } = useConversation();
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !conversationId) return;

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Images are limited to 4 MB.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const image = await uploadChatImage(supabase, conversationId, file);
      await axios.post("/api/messages", { image, conversationId });
    } catch {
      toast.error("Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !conversationId) return;

    if (file.size > MAX_FILE_BYTES) {
      toast.error("Files are limited to 20 MB.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const fileUrl = await uploadChatFile(supabase, conversationId, file);
      await axios.post("/api/messages", {
        conversationId,
        fileUrl,
        fileName: file.name,
        fileSize: file.size,
      });
    } catch {
      toast.error("Couldn't upload that file.");
    } finally {
      setUploading(false);
    }
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
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={onPickImage}
        />
        <button
          type="button"
          aria-label="Send a photo"
          disabled={uploading}
          onClick={() => imageInputRef.current?.click()}
          className="gm-icon-btn"
          style={{
            flex: "none",
            width: 44,
            height: 44,
            display: "grid",
            placeItems: "center",
            boxShadow: "inset 0 0 0 0.5px var(--hair)",
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <HiOutlinePhoto size={19} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          hidden
          onChange={onPickFile}
        />
        <button
          type="button"
          aria-label="Attach a file"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="gm-icon-btn"
          style={{
            flex: "none",
            width: 44,
            height: 44,
            display: "grid",
            placeItems: "center",
            boxShadow: "inset 0 0 0 0.5px var(--hair)",
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <HiOutlinePaperClip size={19} />
        </button>

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
