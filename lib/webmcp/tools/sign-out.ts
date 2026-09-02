import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult } from "@/lib/webmcp/budget";

/**
 * Two-call confirmation like delete_message, and local scope only: a single
 * injected call must not be able to log the user out of every device.
 */
export const signOut: ToolFactory = (ctx) => ({
  name: "sign_out",
  description:
    "Sign the current user out of Verb in this browser. Call once to hear what will happen, " +
    "then call again with confirm: true once the user agrees.",
  inputSchema: {
    type: "object",
    properties: {
      confirm: {
        type: "boolean",
        description: "Set true only after the user has explicitly agreed to sign out.",
      },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    if (input.confirm !== true) {
      return textResult(
        "Ask the user to confirm signing out of Verb in this browser (other devices stay " +
          "signed in). Call sign_out again with confirm: true once they agree."
      );
    }

    await ctx.supabase.auth.signOut({ scope: "local" });
    ctx.navigate("/");
    return textResult("Signed out of this browser.");
  },
});
