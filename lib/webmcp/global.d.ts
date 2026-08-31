export {};

/**
 * Ambient types for the WebMCP Web Model Context API
 * (https://webmachinelearning.github.io/webmcp/). TypeScript doesn't ship
 * these yet, and the API only exists at runtime in a WebMCP-capable browser
 * agent (e.g. ChatGPT's built-in browser on GPT-5.6 Sol/Terra) -- every
 * call site guards with `typeof document.modelContext?.registerTool`.
 */
declare global {
  type ModelContextContent = { type: "text"; text: string };

  type ModelContextToolResult = {
    content: ModelContextContent[];
    isError?: boolean;
  };

  type ModelContextRequestUserInteraction = (options: {
    prompt: string;
    type?: "confirmation";
  }) => Promise<{ confirmed: boolean }>;

  /** Passed as execute's second argument when the host agent supports it. */
  type ModelContextAgent = {
    requestUserInteraction?: ModelContextRequestUserInteraction;
  };

  type ModelContextToolAnnotations = {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };

  type ModelContextTool = {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    annotations?: ModelContextToolAnnotations;
    execute: (
      input: Record<string, unknown>,
      agent?: ModelContextAgent
    ) => Promise<ModelContextToolResult>;
  };

  interface ModelContext {
    registerTool(
      tool: ModelContextTool,
      options?: { signal?: AbortSignal }
    ): Promise<undefined>;
  }

  interface Document {
    readonly modelContext?: ModelContext;
  }
}
