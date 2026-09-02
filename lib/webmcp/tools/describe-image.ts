import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

export const describeImage: ToolFactory = (ctx) => ({
  name: "describe_image",
  description:
    "Describe what's in an image message, so a blind or low-vision user can understand it.",
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "The message id from read_conversation that shared the image.",
      },
    },
    required: ["message_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async (input) => {
    const messageId = String(input.message_id || "");
    if (!messageId) return errorResult("message_id is required.");

    // Resolving the signed URL server-side (rather than trusting one the
    // model retyped) sidesteps a real failure mode: a ~400-char Supabase
    // signed URL is easy for a model to mistype when copying it into the
    // next tool call, and the output-budget truncation in read_conversation
    // could cut one mid-token -- both produce an invalid signature, which
    // Supabase reports as a permission error that has nothing to do with
    // the image itself.
    const { data: message, error } = await ctx.supabase
      .from("messages")
      .select("image")
      .eq("id", messageId)
      .maybeSingle();

    if (error) return errorResult(`Could not look up that message: ${error.message}`);
    if (!message?.image) return errorResult("That message has no image attached.");

    const res = await fetch("/api/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: message.image }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return errorResult(`Could not describe the image (status ${res.status}). ${detail}`.trim());
    }

    const { description } = await res.json();
    return textResult(wrapUntrusted(description || "No description available."));
  },
});
