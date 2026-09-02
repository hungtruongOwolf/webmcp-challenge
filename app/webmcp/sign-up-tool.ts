import type { WebMCPTool } from "./browser-api";
import {
  authFailureMessage,
  createAuthGateway,
} from "@/app/libs/auth/auth-gateway";
import { sanitizeAuthReturnPath } from "@/app/libs/auth/return-path";
import { clampOutput, errorResult } from "@/lib/webmcp/budget";

/**
 * The only public (signed-out) write tool: creates a Verb account with a
 * passkey, no password ever typed or shown. registerPasskey() inside
 * signUpWithPasskey() triggers the browser's real WebAuthn ceremony
 * (fingerprint/face/PIN/security key) -- that step is inherently the
 * human's alone; nothing here can complete it on their behalf, by design.
 * If it's cancelled or fails, signUpWithPasskey() has already rolled the
 * account back before this returns, so the same email can be retried.
 */
export const createSignUpTool = (): WebMCPTool => ({
  name: "sign_up",
  description:
    "Create a new Verb account secured by a passkey -- never a password. Ask the person for " +
    "their name and email, then call this. Their device will then prompt for a fingerprint, " +
    "face, PIN, or security key -- that step needs the human directly, never attempt or " +
    "describe it as automatic. If it's cancelled, nothing is created and the same email works " +
    "again.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The person's display name.",
      },
      email: {
        type: "string",
        description: "Their email address.",
      },
    },
    required: ["name", "email"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const name = String(input.name || "").trim();
    const email = String(input.email || "").trim();

    if (!name) return errorResult("name is required.");
    if (!email) return errorResult("email is required.");

    const gateway = createAuthGateway();
    const returnPath = sanitizeAuthReturnPath(
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : undefined
    );

    const result = await gateway.signUpWithPasskey({ name, email, returnPath });

    if (!result.ok) {
      return {
        content: [{ type: "text", text: clampOutput(authFailureMessage(result.code)) }],
        isError: true,
      };
    }

    if (!result.value.hasSession) {
      return {
        content: [
          {
            type: "text",
            text: "Account created. A confirmation link was emailed -- ask the person to open it, then set up their passkey.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: clampOutput(
            `${name}'s Verb account is ready and signed in with their new passkey.`
          ),
        },
      ],
    };
  },
});
