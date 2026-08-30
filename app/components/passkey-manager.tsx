"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { HiOutlineFingerPrint, HiOutlineTrash } from "react-icons/hi2";

import Button from "@/app/components/button";
import { createClient } from "@/app/libs/supabase/client";

type Passkey = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

/**
 * List, rename and revoke the passkeys on this account.
 *
 * Enrolment is per-device: a passkey saved on a laptop does not appear on a
 * phone, so the list is expected to grow one row per device the user signs
 * in from.
 */
const PasskeyManager = () => {
  const [supabase] = useState(() => createClient());
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.passkey.list();
      if (error) throw error;
      setPasskeys(data ?? []);
    } catch {
      setPasskeys([]);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
    refresh();
  }, [refresh]);

  const add = async () => {
    setIsBusy(true);

    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;

      toast.success("Passkey added.");
      await refresh();
    } catch (error: any) {
      if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
        toast.error(error?.message ?? "Could not add the passkey.");
      }
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async (id: string) => {
    setIsBusy(true);

    try {
      const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
      if (error) throw error;

      toast.success("Passkey removed.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not remove the passkey.");
    } finally {
      setIsBusy(false);
    }
  };

  if (!supported) return null;

  return (
    <div className="border-t border-gray-900/10 pt-8">
      <h2 className="text-base font-semibold leading-7 text-gray-900">
        Passkeys
      </h2>
      <p className="mt-1 text-sm leading-6 text-gray-600">
        Sign in with your fingerprint, face, or device PIN. Each device you use
        needs its own.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {!isLoading && passkeys.length === 0 && (
          <p className="text-sm text-gray-500">
            No passkeys yet on this account.
          </p>
        )}

        {passkeys.map((passkey) => (
          <div
            key={passkey.id}
            className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2"
          >
            <div className="flex items-center gap-3 min-w-0">
              <HiOutlineFingerPrint
                size={20}
                className="text-sky-500 shrink-0"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {passkey.friendly_name || "Unnamed device"}
                </p>
                <p className="text-xs text-gray-500">
                  Added {new Date(passkey.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => remove(passkey.id)}
              disabled={isBusy}
              aria-label={`Remove ${passkey.friendly_name || "this passkey"}`}
              className="rounded p-2 text-gray-400 transition hover:bg-gray-100 hover:text-rose-600 disabled:opacity-50"
            >
              <HiOutlineTrash size={18} />
            </button>
          </div>
        ))}

        <div>
          <Button type="button" onClick={add} disabled={isBusy} secondary>
            Add a passkey
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PasskeyManager;
