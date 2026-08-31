export type JSONSchema = Record<string, unknown>;

export type WebMCPTool = {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute: (
    input: unknown,
    context: { signal: AbortSignal }
  ) => string | Promise<string>;
};

export type WebMCPModelContext = {
  registerTool: (
    tool: WebMCPTool,
    options?: { signal?: AbortSignal }
  ) => Promise<void>;
};

type WebMCPDocument = Document & {
  modelContext?: WebMCPModelContext;
};

export const getWebMCPModelContext = (): WebMCPModelContext | null => {
  if (typeof document === "undefined") return null;
  return (document as WebMCPDocument).modelContext ?? null;
};
