import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult } from "@/lib/webmcp/budget";

export const getMyProfile: ToolFactory = (ctx) => ({
  name: "get_my_profile",
  description: "Return the name, email, and id of the currently signed-in user.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  execute: async () => {
    const name = ctx.currentUser.user_metadata?.name || ctx.currentUser.email;

    return textResult(
      `Signed in as ${name} (id: ${ctx.currentUser.id}, ${ctx.currentUser.email}).`
    );
  },
});
