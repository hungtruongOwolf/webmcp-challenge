"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import type { User } from "@/app/types";
import { HiXMark } from "react-icons/hi2";

import { createClient } from "@/app/libs/supabase/client";
import { uploadAvatar } from "@/app/libs/supabase/upload";
import Avatar from "@/app/components/avatar";
import ConfirmDialog from "@/app/components/modals/confirm-dialog";
import PasskeyManager from "@/app/components/passkey-manager";

type ProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
};

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, currentUser }) => {
  const router = useRouter();
  const [name, setName] = useState(currentUser?.name || "");
  const [image, setImage] = useState(currentUser?.image || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentUser?.name || "");
      setImage(currentUser?.image || "");
      setNameError(null);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      toast.error("Photos are limited to 4 MB.");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const url = await uploadAvatar(createClient(), file);
      setImage(url);
    } catch {
      toast.error("Couldn't upload that photo.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const save = () => {
    if (!name.trim()) {
      setNameError("Display name is required.");
      requestAnimationFrame(() => nameInputRef.current?.focus());
      return;
    }

    setIsSaving(true);

    axios
      .post("/api/settings", { name: name.trim(), image })
      .then(() => {
        router.refresh();
        onClose();
      })
      .catch(() => toast.error("Something went wrong."))
      .finally(() => setIsSaving(false));
  };

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        className="gm-glass3"
        style={{ position: "absolute", inset: 0, zIndex: 23, display: "grid", placeItems: "center", padding: 24, background: "var(--scrim)" }}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Your profile"
          onClick={(e) => e.stopPropagation()}
          className="gm-glass2"
          style={{ width: "100%", maxWidth: 400, maxHeight: "100%", overflowY: "auto", padding: 22, borderRadius: 22, boxShadow: "var(--e2), inset 0 1px 0 var(--hi)", display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.015em" }}>Your profile</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="gm-icon-btn" style={{ width: 32, height: 32 }}>
              <HiXMark size={16} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar user={{ ...currentUser, image } as User} size={64} showStatus={false} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={onPickAvatar}
              />
              <button
                type="button"
                disabled={isUploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
                style={{ height: 32, padding: "0 12px", border: "none", borderRadius: 10, background: "var(--hover)", color: "var(--t1)", fontSize: 12.5, fontWeight: 600, cursor: isUploadingAvatar ? "default" : "pointer", display: "grid", placeItems: "center", opacity: isUploadingAvatar ? 0.6 : 1 }}
              >
                {isUploadingAvatar ? "Uploading…" : "Change photo"}
              </button>
              <span style={{ fontSize: 11.5, color: "var(--t3)" }}>
                JPG, PNG, WebP, or GIF, up to 4 MB
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="profile-name" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}>Display name</label>
            <input
              ref={nameInputRef}
              id="profile-name"
              type="text"
              autoComplete="name"
              required
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "profile-name-error" : undefined}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              style={{ height: 38, padding: "0 12px", border: "none", borderRadius: 10, background: "var(--bub-in)", color: "var(--t1)", fontSize: 14, outline: "none", boxShadow: "inset 0 0 0 0.5px var(--hair)" }}
            />
            {nameError && (
              <span id="profile-name-error" role="alert" style={{ fontSize: 12, color: "#c73e43" }}>
                {nameError}
              </span>
            )}
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={currentUser?.email || ""}
              readOnly
              style={{ height: 38, padding: "0 12px", border: "none", borderRadius: 10, background: "var(--hover)", color: "var(--t3)", fontSize: 14, outline: "none", boxShadow: "inset 0 0 0 0.5px var(--hair)" }}
            />
            <span style={{ fontSize: 11.5, color: "var(--t3)" }}>Your email comes from your sign-in and can&apos;t be changed here.</span>
          </label>

          <PasskeyManager />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 2 }}>
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 10, background: "var(--sel)", color: "var(--accent-t)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Log out
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onClose} style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 10, background: "var(--hover)", color: "var(--t1)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 10, background: isSaving ? "var(--hover)" : "var(--accent)", color: isSaving ? "var(--t3)" : "#fff", fontSize: 13, fontWeight: 600, cursor: isSaving ? "default" : "pointer" }}
              >
                Save changes
              </button>
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={confirmLogout}
        title="Log out"
        body="You'll need to sign in again to access your chats."
        confirmLabel="Log out"
        onConfirm={logout}
        onCancel={() => setConfirmLogout(false)}
      />
    </>
  );
};

export default ProfileModal;
