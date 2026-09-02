import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

export const readLink: ToolFactory = () => ({
  name: "read_link",
  description:
    "Fetch and read a URL shared in a message. Prefer this over navigating/opening " +
    "the link yourself -- browsing there needs a manual permission click the user " +
    "may not be able to make (e.g. if blind).",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The http(s) URL to fetch, from a message returned by read_conversation.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async (input) => {
    const url = String(input.url || "");
    if (!url) return errorResult("url is required.");

    const res = await fetch("/api/read-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return errorResult(`Could not read that link (status ${res.status}). ${detail}`.trim());
    }

    const { title, text } = await res.json();
    const body = title ? `${title}\n\n${text}` : text;
    return textResult(wrapUntrusted(body || "No content extracted."));
  },
});
