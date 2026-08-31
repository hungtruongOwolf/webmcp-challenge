import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult, wrapUntrusted } from "@/lib/webmcp/budget";

export const readFile: ToolFactory = () => ({
  name: "read_file",
  description:
    "Read the text content of a file message (.txt, .csv, .pdf) so the agent can answer questions about it.",
  inputSchema: {
    type: "object",
    properties: {
      file_url: {
        type: "string",
        description: "The file URL from a message returned by read_conversation.",
      },
      file_name: {
        type: "string",
        description: "The file name, if known -- used to tell the file type.",
      },
    },
    required: ["file_url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const fileUrl = String(input.file_url || "");
    if (!fileUrl) return errorResult("file_url is required.");

    const fileName = input.file_name ? String(input.file_name) : undefined;

    const res = await fetch("/api/read-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl, fileName }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return errorResult(`Could not read the file (status ${res.status}). ${detail}`.trim());
    }

    const { text } = await res.json();
    return textResult(wrapUntrusted(text || "No content extracted."));
  },
});
