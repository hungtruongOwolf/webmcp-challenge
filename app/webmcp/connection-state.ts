export type ConnectionStatusName =
  | "SIGNED_OUT"
  | "AUTHENTICATING"
  | "SESSION_READY"
  | "TOOLS_REGISTERING"
  | "CONNECTED"
  | "SIGNED_IN_TOOLS_UNAVAILABLE"
  | "SIGNED_IN_TOOLS_FAILED"
  | "SESSION_EXPIRED";

export type ConnectionState = {
  status: ConnectionStatusName;
  userId: string | null;
};

export type ConnectionEvent =
  | { type: "AUTH_STARTED" }
  | { type: "SIGNED_OUT" }
  | { type: "SESSION_READY"; userId: string }
  | { type: "TOOLS_REGISTERING"; userId: string }
  | { type: "TOOLS_CONNECTED"; userId: string }
  | { type: "TOOLS_UNAVAILABLE"; userId: string }
  | { type: "TOOLS_FAILED"; userId: string }
  | { type: "SESSION_EXPIRED" };

export type ConnectionSnapshot = {
  authenticated: boolean;
  state: ConnectionStatusName;
  route: string;
  nextAction: "sign_in_on_page" | "none";
  /**
   * Only set when nextAction is "sign_in_on_page". Every sign-in path here
   * (password, magic-link email, passkey biometric/security-key) requires
   * the human's own action -- there is no WebMCP tool for it, by design.
   * An agent that doesn't read this ends up repeatedly clicking the
   * sign-in button itself, which can never complete a passkey ceremony.
   */
  guidance: string | null;
};

export const SIGN_IN_GUIDANCE =
  "Sign-in requires the human, not the agent -- password, magic-link email, and passkey " +
  "(biometric/security-key) all need the human's own action on this page. Do not click " +
  "sign-in controls yourself. Ask the user to sign in, then call this tool again.";

export const initialConnectionState: ConnectionState = {
  status: "SIGNED_OUT",
  userId: null,
};

export const connectionReducer = (
  state: ConnectionState,
  event: ConnectionEvent
): ConnectionState => {
  switch (event.type) {
    case "AUTH_STARTED":
      return { status: "AUTHENTICATING", userId: null };
    case "SIGNED_OUT":
      return initialConnectionState;
    case "SESSION_READY":
      return { status: "SESSION_READY", userId: event.userId };
    case "TOOLS_REGISTERING":
      return { status: "TOOLS_REGISTERING", userId: event.userId };
    case "TOOLS_CONNECTED":
      return { status: "CONNECTED", userId: event.userId };
    case "TOOLS_UNAVAILABLE":
      return { status: "SIGNED_IN_TOOLS_UNAVAILABLE", userId: event.userId };
    case "TOOLS_FAILED":
      return { status: "SIGNED_IN_TOOLS_FAILED", userId: event.userId };
    case "SESSION_EXPIRED":
      return { status: "SESSION_EXPIRED", userId: null };
    default:
      return state;
  }
};

const CONNECTION_MESSAGES: Record<ConnectionState["status"], string> = {
  SIGNED_OUT: "Sign in required.",
  AUTHENTICATING: "Signing in…",
  SESSION_READY: "Signed in. Connecting Messenger…",
  TOOLS_REGISTERING: "Signed in. Connecting Messenger…",
  CONNECTED: "Signed in. Messenger connected.",
  SIGNED_IN_TOOLS_UNAVAILABLE:
    "Signed in. Messenger is ready; agent tools are unavailable in this browser.",
  SIGNED_IN_TOOLS_FAILED: "Signed in. Agent tools could not connect.",
  SESSION_EXPIRED: "Your session expired. Nothing was sent. Sign in again.",
};

export const connectionMessage = (state: ConnectionState): string =>
  CONNECTION_MESSAGES[state.status];
