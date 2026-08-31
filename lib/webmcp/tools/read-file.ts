import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

export const readFile: ToolFactory = (ctx) => ({
  name: "read_file",
  description:
    "Read the text content of a file message (.txt, .csv, .pdf) so the agent can answer questions about it.",
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "The message id from read_conversation that shared the file.",
      },
    },
    required: ["message_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const messageId = String(input.message_id || "");
    if (!messageId) return errorResult("message_id is required.");

    // See describe_image for why this resolves the URL server-side instead
    // of trusting one the model retyped from a prior tool result.
    const { data: message, error } = await ctx.supabase
      .from("messages")
      .select("file_url, file_name")
      .eq("id", messageId)
      .maybeSingle();

    if (error) return errorResult(`Could not look up that message: ${error.message}`);
    if (!message?.file_url) return errorResult("That message has no file attached.");

    const res = await fetch("/api/read-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: message.file_url, fileName: message.file_name }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return errorResult(`Could not read the file (status ${res.status}). ${detail}`.trim());
    }

    const { text } = await res.json();
    return textResult(wrapUntrusted(text || "No content extracted."));
  },
});
