const FOCUS_AFTER_AUTH_KEY = "messenger:focus-after-auth";

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

  try {
    const shouldFocus =
      window.sessionStorage.getItem(FOCUS_AFTER_AUTH_KEY) === "true";
    window.sessionStorage.removeItem(FOCUS_AFTER_AUTH_KEY);
    return shouldFocus;
  } catch {
    return false;
  }
};
