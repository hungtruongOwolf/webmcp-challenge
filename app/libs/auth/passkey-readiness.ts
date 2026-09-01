export type PasskeyReadiness =
  | { status: "checking"; message: "Checking passkey support…" }
  | { status: "ready"; message: "Passkeys are available." }
  | {
      status: "unsupported";
      message: "Passkeys are not supported in this browser. Use a password instead.";
    }
  | {
      status: "misconfigured";
      message: "Passkeys are temporarily unavailable. Use a password instead.";
    };

type PasskeyReadinessInput = {
  currentOrigin: string;
  configuredOrigin: string;
  rpId: string;
  hasWebAuthn: boolean;
};

const READY: PasskeyReadiness = {
  status: "ready",
  message: "Passkeys are available.",
};

const UNSUPPORTED: PasskeyReadiness = {
  status: "unsupported",
  message:
    "Passkeys are not supported in this browser. Use a password instead.",
};

const MISCONFIGURED: PasskeyReadiness = {
  status: "misconfigured",
  message:
    "Passkeys are temporarily unavailable. Use a password instead.",
};

export const evaluatePasskeyReadiness = ({
  currentOrigin,
  configuredOrigin,
  rpId,
  hasWebAuthn,
}: PasskeyReadinessInput): PasskeyReadiness => {
  let currentUrl: URL;
  let configuredUrl: URL;

  try {
    currentUrl = new URL(currentOrigin);
    configuredUrl = new URL(configuredOrigin);
  } catch {
    return MISCONFIGURED;
  }

  const isLocalDevelopment = configuredUrl.hostname === "localhost";
  const hasSecureProtocol =
    configuredUrl.protocol === "https:" ||
    (isLocalDevelopment && configuredUrl.protocol === "http:");

  if (
    currentOrigin !== currentUrl.origin ||
    configuredOrigin !== configuredUrl.origin ||
    currentUrl.origin !== configuredUrl.origin ||
    configuredUrl.hostname !== rpId ||
    !hasSecureProtocol
  ) {
    return MISCONFIGURED;
  }

  return hasWebAuthn ? READY : UNSUPPORTED;
};
