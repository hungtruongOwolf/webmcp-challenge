"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/app/components/button";
import { usePasskeyReadiness } from "@/app/hooks/use-passkey-readiness";
import {
  authFailureMessage,
  createAuthGateway,
  type AuthGateway,
} from "@/app/libs/auth/auth-gateway";
import { sanitizeAuthReturnPath } from "@/app/libs/auth/return-path";
import { useWebMCPConnection } from "@/app/webmcp/connection-provider";

type PasskeyEnrollmentProps = {
  returnPath: string;
  gateway?: AuthGateway;
};

export const PasskeyEnrollment = ({
  returnPath,
  gateway,
}: PasskeyEnrollmentProps) => {
  const router = useRouter();
  const { announce } = useWebMCPConnection();
  const readiness = usePasskeyReadiness();
  const gatewayRef = useRef<AuthGateway | null>(gateway ?? null);
  const [isBusy, setIsBusy] = useState(false);
  const enrollButtonRef = useRef<HTMLButtonElement>(null);
  const destination = sanitizeAuthReturnPath(returnPath);

  const getGateway = () => {
    gatewayRef.current ??= createAuthGateway();
    return gatewayRef.current;
  };

  useEffect(() => {
    if (readiness.status !== "checking") announce(readiness.message);
  }, [announce, readiness.message, readiness.status]);

  const enroll = async () => {
    setIsBusy(true);
    const result = await getGateway().registerPasskey();
    setIsBusy(false);

    if (result.ok) {
      announce("Passkey saved. Next time, one action.");
      router.replace(destination);
      return;
    }

    announce(authFailureMessage(result.code));
    if (result.code === "PASSKEY_CANCELLED") {
      requestAnimationFrame(() => enrollButtonRef.current?.focus());
    }
  };

  const skip = () => {
    announce("Passkey setup skipped.");
    router.replace(destination);
  };

  return (
    <div className="mt-8 space-y-4">
      <p className="text-sm text-gray-600">{readiness.message}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          ref={enrollButtonRef}
          type="button"
          onClick={enroll}
          disabled={isBusy || readiness.status !== "ready"}
          className="flex justify-center rounded-md bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-default disabled:opacity-50"
        >
          {isBusy ? "Setting up…" : "Set up passkey"}
        </button>
        <Button type="button" onClick={skip} disabled={isBusy} secondary>
          Maybe later
        </Button>
      </div>
    </div>
  );
};
