"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HiOutlineFingerPrint } from "react-icons/hi2";

import { useCurrentUser } from "@/app/context/current-user-context";
import { usePasskeyReadiness } from "@/app/hooks/use-passkey-readiness";
import {
  authFailureMessage,
  createAuthGateway,
  type AuthGateway,
} from "@/app/libs/auth/auth-gateway";
import { markFocusAfterAuth } from "@/app/libs/auth/focus-after-auth";
import {
  buildPasskeyEnrollmentPath,
  sanitizeAuthReturnPath,
} from "@/app/libs/auth/return-path";
import { useWebMCPConnection } from "@/app/webmcp/connection-provider";

import { EmailAuthForm } from "./email-auth-form";

type Variant = "LOGIN" | "REGISTER";

type AuthFormProps = {
  returnPath: string;
  callbackError?: "auth_link_invalid";
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  padding: 24,
  borderRadius: 22,
  boxShadow: "var(--e2), inset 0 1px 0 var(--hi)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  minHeight: 44,
  border: "none",
  borderRadius: 10,
  background: "var(--accent)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
});

const AuthForm = ({ returnPath, callbackError }: AuthFormProps) => {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const readiness = usePasskeyReadiness();
  const { beginAuthentication, returnToSignedOut } = useWebMCPConnection();
  const [variant, setVariant] = useState<Variant>("LOGIN");
  const [isPending, setIsPending] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const submissionLockRef = useRef(false);
  const gatewayRef = useRef<AuthGateway | null>(null);
  const passkeyButtonRef = useRef<HTMLButtonElement>(null);
  const callbackAlertRef = useRef<HTMLDivElement>(null);
  const destination = sanitizeAuthReturnPath(returnPath);

  const getGateway = () => {
    gatewayRef.current ??= createAuthGateway();
    return gatewayRef.current;
  };

  const startSubmission = useCallback(() => {
    if (submissionLockRef.current) return false;
    submissionLockRef.current = true;
    setIsPending(true);
    return true;
  }, []);

  const endSubmission = useCallback(() => {
    submissionLockRef.current = false;
    setIsPending(false);
  }, []);

  useEffect(() => {
    if (currentUser) router.replace(destination);
  }, [currentUser, destination, router]);

  useEffect(() => {
    if (
      callbackError !== "auth_link_invalid" ||
      readiness.status === "checking"
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => callbackAlertRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [callbackError, readiness.status]);

  const toggleVariant = useCallback(() => {
    if (submissionLockRef.current) return;
    setOperationError(null);
    setVariant((current) => (current === "LOGIN" ? "REGISTER" : "LOGIN"));
  }, []);

  const completeAuthentication = useCallback(() => {
    markFocusAfterAuth();
    router.replace(destination);
    router.refresh();
  }, [destination, router]);

  const offerPasskeyEnrollment = useCallback(() => {
    router.replace(buildPasskeyEnrollmentPath(destination));
  }, [destination, router]);

  const signInWithPasskey = async () => {
    if (!startSubmission()) return;
    setOperationError(null);
    beginAuthentication();
    const result = await getGateway().signInWithPasskey();
    endSubmission();

    if (result.ok) {
      completeAuthentication();
      return;
    }

    const message = authFailureMessage(result.code);
    if (result.code === "PASSKEY_CANCELLED") {
      returnToSignedOut(message);
      requestAnimationFrame(() => passkeyButtonRef.current?.focus());
    } else {
      returnToSignedOut("");
      setOperationError(message);
    }
  };

  return (
    <div className="gm-glass2" style={cardStyle}>
      <h2
        style={{
          margin: 0,
          fontSize: 17,
          fontWeight: 600,
          color: "var(--t1)",
        }}
      >
        Sign in options
      </h2>

      {readiness.status === "checking" ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--t2)" }}>
          {readiness.message}
        </p>
      ) : (
        <>
          {callbackError === "auth_link_invalid" && !operationError && (
            <div
              ref={callbackAlertRef}
              role="alert"
              tabIndex={-1}
              style={{
                borderRadius: 10,
                padding: 12,
                background: "var(--sel)",
                color: "var(--t1)",
                fontSize: 13,
              }}
            >
              <p style={{ margin: "0 0 6px" }}>
                That confirmation link is invalid or expired.
              </p>
              <a href="#email" style={{ color: "var(--accent-t)" }}>
                Try creating your account again
              </a>
            </div>
          )}

          {variant === "LOGIN" &&
            (readiness.status === "ready" ? (
              <>
                <button
                  ref={passkeyButtonRef}
                  type="button"
                  onClick={signInWithPasskey}
                  disabled={isPending}
                  aria-describedby="passkey-method-description"
                  style={primaryButtonStyle(isPending)}
                >
                  <HiOutlineFingerPrint size={19} aria-hidden />
                  Sign in with a passkey
                </button>
                <p
                  id="passkey-method-description"
                  style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--t2)" }}
                >
                  Your operating system may offer a fingerprint, face, device
                  PIN, password manager, or hardware security key.
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--t2)" }}>
                {readiness.message}
              </p>
            ))}

          <EmailAuthForm
            variant={variant}
            returnPath={destination}
            gateway={getGateway()}
            onAuthenticated={completeAuthentication}
            onPasskeyEnrollment={offerPasskeyEnrollment}
            isPending={isPending}
            onSubmissionStart={startSubmission}
            onSubmissionEnd={endSubmission}
            operationError={operationError}
            onOperationError={setOperationError}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 6,
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--t3)" }}>
              {variant === "LOGIN"
                ? "New to Verb?"
                : "Already have an account?"}
            </span>
            <button
              type="button"
              onClick={toggleVariant}
              disabled={isPending}
              style={{
                border: "none",
                padding: 0,
                background: "none",
                color: "var(--accent-t)",
                fontSize: 13,
                fontWeight: 600,
                cursor: isPending ? "default" : "pointer",
              }}
            >
              {variant === "LOGIN" ? "Create an account" : "Log in"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AuthForm;
