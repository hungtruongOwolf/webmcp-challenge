import type { WebMCPTool } from "./browser-api";
import type { ConnectionSnapshot } from "./connection-state";

export const createConnectionStatusTool = (
  getSnapshot: () => ConnectionSnapshot
): WebMCPTool => ({
  name: "get_connection_status",
  description:
    "Report whether this Messenger page is signed in and whether its agent tools are connected. Use before requesting Messenger actions.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: false,
  },
  execute: async () => JSON.stringify(getSnapshot()),
});
