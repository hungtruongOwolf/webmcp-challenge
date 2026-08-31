import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

export const describeImage: ToolFactory = () => ({
  name: "describe_image",
  description:
    "Describe what's in an image message, so a blind or low-vision user can understand it.",
  inputSchema: {
    type: "object",
    properties: {
      image_url: {
        type: "string",
        description: "The image URL from a message returned by read_conversation.",
      },
    },
    required: ["image_url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const imageUrl = String(input.image_url || "");
    if (!imageUrl) return errorResult("image_url is required.");

    const res = await fetch("/api/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return errorResult(`Could not describe the image (status ${res.status}). ${detail}`.trim());
    }

    const { description } = await res.json();
    return textResult(wrapUntrusted(description || "No description available."));
  },
});
