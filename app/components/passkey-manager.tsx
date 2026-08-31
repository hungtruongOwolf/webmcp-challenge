"use client";

import { useCallback, useEffect, useState } from "react";
import { HiOutlineFingerPrint, HiOutlineTrash } from "react-icons/hi2";

import Button from "@/app/components/button";
import { usePasskeyReadiness } from "@/app/hooks/use-passkey-readiness";
import {
  authFailureMessage,
  createAuthGateway,
  type AuthGateway,
  type PasskeyRecord,
} from "@/app/libs/auth/auth-gateway";
import { useWebMCPConnection } from "@/app/webmcp/connection-provider";

type PasskeyManagerProps = {
  gateway?: AuthGateway;
};

/**
 * Lists and revokes passkeys on this account, even when this browser cannot
 * enroll another one.
 */
const PasskeyManager = ({ gateway }: PasskeyManagerProps) => {
  const [authGateway] = useState(() => gateway ?? createAuthGateway());
  const { announce } = useWebMCPConnection();
  const readiness = usePasskeyReadiness();
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await authGateway.listPasskeys();
    if (result.ok) {
      setPasskeys(result.value);
    } else {
      setPasskeys([]);
      announce(authFailureMessage(result.code));
    }
    setIsLoading(false);
  }, [announce, authGateway]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    setIsBusy(true);
    const result = await authGateway.registerPasskey();
    if (result.ok) {
      announce("Passkey added.");
      await refresh();
    } else {
      announce(authFailureMessage(result.code));
    }
    setIsBusy(false);
  };

  const remove = async (id: string) => {
    setIsBusy(true);
    const result = await authGateway.deletePasskey(id);
    if (result.ok) {
      announce("Passkey removed.");
      await refresh();
    } else {
      announce(authFailureMessage(result.code));
    }
    setIsBusy(false);
  };

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
            <div className="flex min-w-0 items-center gap-3">
              <HiOutlineFingerPrint
                size={20}
                className="shrink-0 text-sky-500"
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

        {readiness.status !== "ready" && (
          <p className="text-sm text-gray-600">{readiness.message}</p>
        )}
        <div>
          <Button
            type="button"
            onClick={add}
            disabled={isBusy || readiness.status !== "ready"}
            secondary
          >
            Add a passkey
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PasskeyManager;
