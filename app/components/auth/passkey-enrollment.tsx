"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HiOutlineFingerPrint } from "react-icons/hi2";

import { cardStyle, primaryButtonStyle } from "@/app/(site)/components/auth-button-style";
import Button from "@/app/components/button";
import { usePasskeyReadiness } from "@/app/hooks/use-passkey-readiness";
import {
  authFailureMessage,
  createAuthGateway,
  type AuthGateway,
} from "@/app/libs/auth/auth-gateway";
import { markFocusAfterAuth } from "@/app/libs/auth/focus-after-auth";
import { sanitizeAuthReturnPath } from "@/app/libs/auth/return-path";
import { useWebMCPConnection } from "@/app/webmcp/connection-provider";

type PasskeyEnrollmentProps = {
  returnPath: string;
  gateway?: AuthGateway;
  autoStart?: boolean;
};

export const PasskeyEnrollment = ({
  returnPath,
  gateway,
  autoStart = false,
}: PasskeyEnrollmentProps) => {
  const router = useRouter();
  const { announce } = useWebMCPConnection();
  const readiness = usePasskeyReadiness();
  const gatewayRef = useRef<AuthGateway | null>(gateway ?? null);
  const [isBusy, setIsBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const enrollButtonRef = useRef<HTMLButtonElement>(null);
  const operationAlertRef = useRef<HTMLDivElement>(null);
  const hasAutoStartedRef = useRef(false);
  const destination = sanitizeAuthReturnPath(returnPath);

  const getGateway = () => {
    gatewayRef.current ??= createAuthGateway();
    return gatewayRef.current;
  };

  useEffect(() => {
    if (readiness.status !== "checking") announce(readiness.message);
  }, [announce, readiness.message, readiness.status]);

  useEffect(() => {
    if (!operationError) return;
    const frame = requestAnimationFrame(() => operationAlertRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [operationError]);

  const enroll = async () => {
    setOperationError(null);
    setIsBusy(true);
    const result = await getGateway().registerPasskey();
    setIsBusy(false);

    if (result.ok) {
      announce("Passkey saved. Next time, one action.");
      markFocusAfterAuth();
      router.replace(destination);
      return;
    }

    const message = authFailureMessage(result.code);
    if (result.code === "PASSKEY_CANCELLED") {
      announce(message);
      requestAnimationFrame(() => enrollButtonRef.current?.focus());
    } else {
      setOperationError(message);
    }
  };

  const skip = () => {
    announce("Passkey setup skipped.");
    markFocusAfterAuth();
    router.replace(destination);
  };

  // Coming from the passkey sign-up button (not the password path's
  // optional upsell), the user already asked for a passkey explicitly --
  // start the WebAuthn ceremony as soon as it's possible instead of making
  // them click "Set up passkey" a second time. Only the first ready render
  // auto-fires; a cancelled/failed attempt still falls back to the manual
  // buttons below rather than retrying in a loop.
  useEffect(() => {
    if (!autoStart || hasAutoStartedRef.current || readiness.status !== "ready") {
      return;
    }
    hasAutoStartedRef.current = true;
    void enroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, readiness.status]);

  return (
    <div className="gm-glass2" style={cardStyle}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--t2)" }}>
        Use your device PIN, a biometric such as your fingerprint or face, or
        a security key for a faster sign-in next time. You can also add or
        remove passkeys later in settings.
      </p>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--t2)" }}>
        {readiness.message}
      </p>
      {operationError && (
        <div
          ref={operationAlertRef}
          role="alert"
          tabIndex={-1}
          className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
          style={{
            borderRadius: 10,
            padding: 12,
            background: "var(--sel)",
            color: "var(--t1)",
            fontSize: 13,
          }}
        >
          {operationError}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          ref={enrollButtonRef}
          type="button"
          onClick={enroll}
          disabled={isBusy || readiness.status !== "ready"}
          style={primaryButtonStyle(isBusy || readiness.status !== "ready")}
        >
          <HiOutlineFingerPrint size={19} aria-hidden />
          {isBusy ? "Setting up…" : "Set up passkey"}
        </button>
        <Button type="button" onClick={skip} disabled={isBusy} secondary fullWidth>
          Maybe later
        </Button>
      </div>
    </div>
  );
};
