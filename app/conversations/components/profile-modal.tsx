"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { CldUploadButton } from "next-cloudinary";
import type { User } from "@/app/types";
import { HiXMark } from "react-icons/hi2";

import { createClient } from "@/app/libs/supabase/client";
import Avatar from "@/app/components/avatar";
import ConfirmDialog from "@/app/components/modals/confirm-dialog";

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
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(currentUser?.name || "");
      setImage(currentUser?.image || "");
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleUpload = (result: any) => {
    setImage(result?.info?.secure_url || "");
  };

  const canSave = name.trim().length > 0 && !isSaving;

  const save = () => {
    if (!canSave) return;

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
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your profile"
          onClick={(e) => e.stopPropagation()}
          className="gm-glass2"
          style={{ width: "100%", maxWidth: 400, padding: 22, borderRadius: 22, boxShadow: "var(--e2), inset 0 1px 0 var(--hi)", display: "flex", flexDirection: "column", gap: 16 }}
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
              <CldUploadButton
                options={{ maxFiles: 1, maxFileSize: 4000000 }}
                onUpload={handleUpload}
                uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_PRESET}
              >
                <span style={{ height: 32, padding: "0 12px", border: "none", borderRadius: 10, background: "var(--hover)", color: "var(--t1)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "grid", placeItems: "center" }}>
                  Change photo
                </span>
              </CldUploadButton>
              <span style={{ fontSize: 11.5, color: "var(--t3)" }}>JPG or PNG, up to 5 MB</span>
            </div>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}>Display name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ height: 38, padding: "0 12px", border: "none", borderRadius: 10, background: "var(--bub-in)", color: "var(--t1)", fontSize: 14, outline: "none", boxShadow: "inset 0 0 0 0.5px var(--hair)" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}>Email</span>
            <input
              type="text"
              value={currentUser?.email || ""}
              readOnly
              style={{ height: 38, padding: "0 12px", border: "none", borderRadius: 10, background: "var(--hover)", color: "var(--t3)", fontSize: 14, outline: "none", boxShadow: "inset 0 0 0 0.5px var(--hair)" }}
            />
            <span style={{ fontSize: 11.5, color: "var(--t3)" }}>Your email comes from your sign-in and can&apos;t be changed here.</span>
          </label>

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
                type="button"
                disabled={!canSave}
                onClick={save}
                style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 10, background: canSave ? "var(--accent)" : "var(--hover)", color: canSave ? "#fff" : "var(--t3)", fontSize: 13, fontWeight: 600, cursor: canSave ? "pointer" : "default" }}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
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
