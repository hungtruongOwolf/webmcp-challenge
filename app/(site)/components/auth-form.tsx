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

const AuthForm = ({ returnPath, callbackError }: AuthFormProps) => {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const readiness = usePasskeyReadiness();
  const { beginAuthentication, returnToSignedOut } = useWebMCPConnection();
  const [variant, setVariant] = useState<Variant>("LOGIN");
  const [isPending, setIsPending] = useState(false);
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
    beginAuthentication();
    const result = await getGateway().signInWithPasskey();
    endSubmission();

    if (result.ok) {
      completeAuthentication();
      return;
    }

    returnToSignedOut(authFailureMessage(result.code));
    if (result.code === "PASSKEY_CANCELLED") {
      requestAnimationFrame(() => passkeyButtonRef.current?.focus());
    }
  };

  return (
    <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div className="rounded-lg bg-white px-4 py-8 shadow-sm sm:px-10">
        <h2 className="mb-6 text-lg font-semibold text-gray-900">
          Sign in options
        </h2>

        {readiness.status === "checking" ? (
          <p className="text-sm text-gray-600">{readiness.message}</p>
        ) : (
          <>
            {callbackError === "auth_link_invalid" && (
              <div
                ref={callbackAlertRef}
                role="alert"
                tabIndex={-1}
                className="mb-6 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
              >
                <p>That sign-in link is invalid or expired.</p>
                <a className="underline" href="#email">
                  Email me a new link
                </a>
              </div>
            )}

            {readiness.status === "ready" ? (
              <button
                ref={passkeyButtonRef}
                type="button"
                onClick={signInWithPasskey}
                disabled={isPending}
                className="mb-6 flex w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-3 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-default disabled:opacity-50"
              >
                <HiOutlineFingerPrint size={20} aria-hidden />
                Sign in with a passkey
              </button>
            ) : (
              <p className="mb-6 text-sm text-gray-600">{readiness.message}</p>
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
            />

            <div className="mt-6 flex justify-center gap-2 px-2 text-sm text-gray-500">
              <p>
                {variant === "LOGIN"
                  ? "New to Messenger?"
                  : "Already have an account?"}
              </p>
              <button
                type="button"
                onClick={toggleVariant}
                disabled={isPending}
                className="cursor-pointer underline"
              >
                {variant === "LOGIN" ? "Create an account" : "Log in"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthForm;
