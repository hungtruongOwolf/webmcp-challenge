export const DEFAULT_AUTH_RETURN_PATH = "/conversations" as const;

const CONVERSATION_PATH =
  /^\/conversations\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const sanitizeAuthReturnPath = (
  candidate: string | null | undefined
): string => {
  if (candidate === "/users" || candidate === "/conversations") {
    return candidate;
  }
  if (candidate && CONVERSATION_PATH.test(candidate)) return candidate;
  return DEFAULT_AUTH_RETURN_PATH;
};

export const buildAuthLandingPath = (
  candidate: string | null | undefined
): string => `/?next=${encodeURIComponent(sanitizeAuthReturnPath(candidate))}`;

export const buildAuthCallbackUrl = (
  origin: string,
  returnPath: string,
  enrollPasskey: boolean
): string => {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", sanitizeAuthReturnPath(returnPath));
  if (enrollPasskey) url.searchParams.set("enroll", "passkey");
  return url.toString();
};

export const buildPasskeyEnrollmentPath = (
  returnPath: string,
  auto?: boolean
): string =>
  `/auth/passkey?next=${encodeURIComponent(sanitizeAuthReturnPath(returnPath))}${
    auto ? "&auto=1" : ""
  }`;
