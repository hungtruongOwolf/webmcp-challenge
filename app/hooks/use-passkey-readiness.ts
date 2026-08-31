"use client";

import { useEffect, useState } from "react";

import {
  evaluatePasskeyReadiness,
  type PasskeyReadiness,
} from "@/app/libs/auth/passkey-readiness";

const CHECKING: PasskeyReadiness = {
  status: "checking",
  message: "Checking passkey support…",
};

const localDevelopmentDefaults = () => {
  const mayUseDefaults =
    process.env.NODE_ENV === "development" && !process.env.CI;

  return {
    configuredOrigin:
      process.env.NEXT_PUBLIC_APP_ORIGIN ??
      (mayUseDefaults ? "http://localhost:3000" : ""),
    rpId:
      process.env.NEXT_PUBLIC_PASSKEY_RP_ID ??
      (mayUseDefaults ? "localhost" : ""),
  };
};

export const usePasskeyReadiness = (): PasskeyReadiness => {
  const [readiness, setReadiness] = useState<PasskeyReadiness>(CHECKING);

  useEffect(() => {
    const { configuredOrigin, rpId } = localDevelopmentDefaults();
    setReadiness(
      evaluatePasskeyReadiness({
        currentOrigin: window.location.origin,
        configuredOrigin,
        rpId,
        hasWebAuthn: typeof window.PublicKeyCredential !== "undefined",
      })
    );
  }, []);

  return readiness;
};
