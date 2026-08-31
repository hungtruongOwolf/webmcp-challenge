import type { WebMCPTool } from "./browser-api";
import type { ConnectionSnapshot } from "./connection-state";
import { createConnectionStatusTool } from "./connection-status-tool";
import type { ToolApiClient } from "./tool-api-client";

export type PublicToolContext = {
  getSnapshot: () => ConnectionSnapshot;
};

export type AuthenticatedToolContext = PublicToolContext & {
  apiClient: ToolApiClient;
};

export type WebMCPToolRegistry = {
  getPublicTools(context: PublicToolContext): WebMCPTool[];
  getAuthenticatedTools(context: AuthenticatedToolContext): WebMCPTool[];
};

export const defaultToolRegistry: WebMCPToolRegistry = {
  getPublicTools: ({ getSnapshot }) => [
    createConnectionStatusTool(getSnapshot),
  ],
  getAuthenticatedTools: ({ getSnapshot }) => [
    createConnectionStatusTool(getSnapshot),
  ],
};
