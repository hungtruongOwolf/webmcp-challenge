import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

export const sendMessage: ToolFactory = (ctx) => ({
  name: "send_message",
  description:
    "Send the currently saved draft for a conversation. Call draft_message before this.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Conversation id with a saved draft, from draft_message.",
      },
    },
    required: ["conversation_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    if (!conversationId) return errorResult("conversation_id is required.");

    const { data: draft, error: draftError } = await ctx.supabase
      .from("drafts")
      .select("body")
      .eq("conversation_id", conversationId)
      .eq("user_id", ctx.currentUser.id)
      .maybeSingle();

    if (draftError) return errorResult(`Could not read the draft: ${draftError.message}`);
    if (!draft?.body) {
      return errorResult("No draft to send for this conversation. Call draft_message first.");
    }

    const { data: conversation } = await ctx.supabase
      .from("conversations")
      .select(`name, members:conversation_members ( profile:profiles (*) )`)
      .eq("id", conversationId)
      .maybeSingle();

    const others = (conversation?.members ?? [])
      .map((m: any) => m.profile)
      .filter((p: any) => p.id !== ctx.currentUser.id);
    const title = conversation?.name || others[0]?.name || "this conversation";

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: draft.body, conversationId }),
    });

    if (!res.ok) return errorResult(`Could not send the message (status ${res.status}).`);

    // Scoped to the exact draft body just sent, not just (conversation, user) --
    // a draft_message call landing between the read above and this delete would
    // otherwise get silently wiped instead of the message that was actually sent.
    await ctx.supabase
      .from("drafts")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", ctx.currentUser.id)
      .eq("body", draft.body);

    return textResult(wrapUntrusted(`Sent to ${title}: "${draft.body}"`));
  },
});
