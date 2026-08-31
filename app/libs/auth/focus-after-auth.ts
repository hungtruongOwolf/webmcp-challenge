const FOCUS_AFTER_AUTH_KEY = "messenger:focus-after-auth";
export const FOCUS_AFTER_AUTH_COOKIE_NAME = "messenger_focus_after_auth";

export const markFocusAfterAuth = (): void => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(FOCUS_AFTER_AUTH_KEY, "true");
  } catch {
    // Authentication must still succeed when storage is unavailable.
  }
};

export const consumeFocusAfterAuth = (): boolean => {
  if (typeof window === "undefined") return false;

  let sessionHandoff = false;
  try {
    sessionHandoff =
      window.sessionStorage.getItem(FOCUS_AFTER_AUTH_KEY) === "true";
    window.sessionStorage.removeItem(FOCUS_AFTER_AUTH_KEY);
  } catch {
    // A server callback cookie can still complete the handoff.
  }

  let serverHandoff = false;
  try {
    serverHandoff = document.cookie
      .split("; ")
      .some((entry) => entry === `${FOCUS_AFTER_AUTH_COOKIE_NAME}=1`);
    if (serverHandoff) {
      document.cookie = `${FOCUS_AFTER_AUTH_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  } catch {
    // Navigation remains successful if cookies are unavailable.
  }

  return sessionHandoff || serverHandoff;
};
