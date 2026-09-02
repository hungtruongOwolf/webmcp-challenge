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
import {
  consumeFocusAfterSignOut,
  markFocusAfterAuth,
} from "@/app/libs/auth/focus-after-auth";
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

const secondaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  minHeight: 44,
  border: "none",
  borderRadius: 10,
  background: "var(--hover)",
  color: "var(--t1)",
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
});

const SIGNED_OUT_NOTICE = "Signed out. Sign in or create a different account.";

const displayNameOf = (user: {
  email?: string;
  user_metadata?: { name?: unknown };
}): string => {
  const name = user.user_metadata?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return user.email ?? "your account";
};

const AuthForm = ({ returnPath, callbackError }: AuthFormProps) => {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const readiness = usePasskeyReadiness();
  const { beginAuthentication, returnToSignedOut } = useWebMCPConnection();
  const [variant, setVariant] = useState<Variant>("LOGIN");
  const [isPending, setIsPending] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [authenticatedHere, setAuthenticatedHere] = useState(false);
  const [signedOutNotice, setSignedOutNotice] = useState("");
  const submissionLockRef = useRef(false);
  const gatewayRef = useRef<AuthGateway | null>(null);
  const passkeyButtonRef = useRef<HTMLButtonElement>(null);
  const callbackAlertRef = useRef<HTMLDivElement>(null);
  const signedInHeadingRef = useRef<HTMLHeadingElement>(null);
  const destination = sanitizeAuthReturnPath(returnPath);
  const formVisible = currentUser === null && readiness.status !== "checking";

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

  // Someone who lands here already signed in did not come through a
  // redirect (the guarded routes only bounce signed-out visitors), so tell
  // them who they are instead of silently sending them on.
  useEffect(() => {
    if (!currentUser || authenticatedHere) return;
    const frame = requestAnimationFrame(() =>
      signedInHeadingRef.current?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [authenticatedHere, currentUser]);

  useEffect(() => {
    if (!formVisible || !consumeFocusAfterSignOut()) return;
    setSignedOutNotice(SIGNED_OUT_NOTICE);
    const frame = requestAnimationFrame(() =>
      document.getElementById("email")?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [formVisible]);

  useEffect(() => {
    if (callbackError !== "auth_link_invalid" || !formVisible) return;

    const frame = requestAnimationFrame(() => callbackAlertRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [callbackError, formVisible]);

  const toggleVariant = useCallback(() => {
    if (submissionLockRef.current) return;
    setOperationError(null);
    setVariant((current) => (current === "LOGIN" ? "REGISTER" : "LOGIN"));
  }, []);

  const completeAuthentication = useCallback(() => {
    setAuthenticatedHere(true);
    markFocusAfterAuth();
    router.replace(destination);
    router.refresh();
  }, [destination, router]);

  const offerPasskeyEnrollment = useCallback(() => {
    setAuthenticatedHere(true);
    router.replace(buildPasskeyEnrollmentPath(destination));
  }, [destination, router]);

  const continueSignedIn = () => {
    markFocusAfterAuth();
    router.replace(destination);
  };

  const signOutForSwitch = async () => {
    if (!startSubmission()) return;
    setOperationError(null);
    const result = await getGateway().signOut();
    endSubmission();
    if (!result.ok) {
      setOperationError(authFailureMessage(result.code));
      return;
    }
    // The auth listener already cleared the client user; this syncs the
    // server-rendered tree so a reload does not resurrect the old session.
    router.refresh();
  };

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

  if (currentUser) {
    const name = displayNameOf(currentUser);

    if (authenticatedHere) {
      return (
        <div className="gm-glass2" style={cardStyle}>
          <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--t1)" }}>
            {`Signed in as ${name}. Opening your chats.`}
          </p>
        </div>
      );
    }

    return (
      <div className="gm-glass2" style={cardStyle}>
        <h2
          ref={signedInHeadingRef}
          tabIndex={-1}
          style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--t1)" }}
        >
          {`Signed in as ${name}`}
        </h2>
        {currentUser.email && (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--t2)" }}>
            {currentUser.email}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--t2)" }}>
          To sign in or create an account for someone else, sign out first.
        </p>
        {operationError && (
          <div role="alert" style={{ fontSize: 13, color: "var(--t1)" }}>
            {operationError}
          </div>
        )}
        <button
          type="button"
          onClick={continueSignedIn}
          disabled={isPending}
          style={primaryButtonStyle(isPending)}
        >
          {`Continue as ${name}`}
        </button>
        <button
          type="button"
          onClick={signOutForSwitch}
          disabled={isPending}
          style={secondaryButtonStyle(isPending)}
        >
          Sign out and use a different account
        </button>
      </div>
    );
  }

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
      {/* Page-local notice, kept separate from the connection indicator's
          status region so the two never fight over one live region. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {signedOutNotice}
      </span>

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

          {readiness.status === "ready" ? (
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
          )}

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
