import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult } from "@/lib/webmcp/budget";

export const signOut: ToolFactory = (ctx) => ({
  name: "sign_out",
  description: "Sign the current user out of Messenger.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: false },
  execute: async () => {
    await ctx.supabase.auth.signOut();
    ctx.navigate("/");
    return textResult("Signed out.");
  },
});
