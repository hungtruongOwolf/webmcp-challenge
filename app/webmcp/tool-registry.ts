import type { WebMCPTool } from "./browser-api";
import type { ConnectionSnapshot } from "./connection-state";
import { createConnectionStatusTool } from "./connection-status-tool";
import { createSignUpTool } from "./sign-up-tool";
import type { ToolApiClient } from "./tool-api-client";

export type PublicToolContext = {
  getSnapshot: () => ConnectionSnapshot;
  beginAuthentication?: () => void;
  returnToSignedOut?: (message: string) => void;
};

export type AuthenticatedToolContext = PublicToolContext & {
  apiClient: ToolApiClient;
};

export type WebMCPToolRegistry = {
  getPublicTools(context: PublicToolContext): WebMCPTool[];
  getAuthenticatedTools(context: AuthenticatedToolContext): WebMCPTool[];
};

export const defaultToolRegistry: WebMCPToolRegistry = {
  getPublicTools: ({ getSnapshot, beginAuthentication, returnToSignedOut }) => [
    createConnectionStatusTool(getSnapshot),
    createSignUpTool({ beginAuthentication, returnToSignedOut }),
  ],
  getAuthenticatedTools: ({ getSnapshot }) => [
    createConnectionStatusTool(getSnapshot),
  ],
};
