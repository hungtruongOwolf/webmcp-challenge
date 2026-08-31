import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult } from "@/lib/webmcp/budget";

/**
 * WebAuthn registration (navigator.credentials.create()) requires a genuine
 * user gesture on this exact page -- no tool call can complete it. But that
 * gesture doesn't have to be a specific button buried in a nested Profile
 * menu; it can be any click. So the accessible gap this closes isn't "let
 * the agent enroll the passkey" (impossible, and shouldn't be), it's
 * "get the user to the one focused control that needs that click" --
 * a blind user can't visually hunt through Profile > Settings > Passkeys
 * to find it themselves.
 */
export const setupPasskey: ToolFactory = (ctx) => ({
  name: "setup_passkey",
  description:
    "Navigate to the passkey setup page so the user can add a passkey (fingerprint/face/security " +
    "key) for faster sign-in. Use when the user says they want to set one up.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: false },
  execute: async () => {
    ctx.navigate("/auth/passkey?next=%2Fconversations");

    return textResult(
      "Opened the passkey setup page -- one control on it: the \"Set up passkey\" button. Ask the " +
        "user to activate it (Enter, or their screen reader's activate gesture) and then follow " +
        "their device's fingerprint/face/security-key prompt when it appears. That prompt has to be " +
        "completed by the user themselves; it can't be triggered by a tool call. There's also a " +
        "\"Maybe later\" button if they change their mind."
    );
  },
});
