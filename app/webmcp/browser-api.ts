export type JSONSchema = Record<string, unknown>;

export type WebMCPTool = ModelContextTool;

export type WebMCPModelContext = {
  registerTool: (
    tool: WebMCPTool,
    options?: { signal?: AbortSignal }
  ) => Promise<void | undefined>;
};

export const getWebMCPModelContext = (): WebMCPModelContext | null => {
  if (typeof document === "undefined") return null;
  return document.modelContext ?? null;
};
