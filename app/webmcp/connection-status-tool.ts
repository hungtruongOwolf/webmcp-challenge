import type { WebMCPTool } from "./browser-api";
import type { ConnectionSnapshot } from "./connection-state";

export const createConnectionStatusTool = (
  getSnapshot: () => ConnectionSnapshot
): WebMCPTool => ({
  name: "get_connection_status",
  description:
    "Report whether this Verb page is signed in and whether its agent tools are connected. " +
    "Use before requesting Verb actions. If not signed in, the result includes guidance -- " +
    "sign-in always requires the human, never click sign-in controls yourself.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: false,
  },
  execute: async () => ({
    content: [{ type: "text", text: JSON.stringify(getSnapshot()) }],
  }),
});
