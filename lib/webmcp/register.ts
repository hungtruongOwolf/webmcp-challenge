import type { ToolActivityEvent, ToolContext } from "@/lib/webmcp/types";
import { errorResult, clampOutput } from "@/lib/webmcp/budget";
import { listConversations } from "@/lib/webmcp/tools/list-conversations";
import { readConversation } from "@/lib/webmcp/tools/read-conversation";
import { searchMessages } from "@/lib/webmcp/tools/search-messages";
import { searchPeople } from "@/lib/webmcp/tools/search-people";
import { getMyProfile } from "@/lib/webmcp/tools/get-my-profile";
import { openConversation } from "@/lib/webmcp/tools/open-conversation";
import { createGroup } from "@/lib/webmcp/tools/create-group";
import { draftMessage } from "@/lib/webmcp/tools/draft-message";
import { sendMessage } from "@/lib/webmcp/tools/send-message";
import { deleteConversation } from "@/lib/webmcp/tools/delete-conversation";
import { describeImage } from "@/lib/webmcp/tools/describe-image";

const TOOL_FACTORIES = [
  listConversations,
  readConversation,
  searchMessages,
  searchPeople,
  getMyProfile,
  openConversation,
  createGroup,
  draftMessage,
  sendMessage,
  deleteConversation,
  describeImage,
];

const summarizeInput = (input: Record<string, unknown>) => {
  const json = JSON.stringify(input ?? {});
  return json.length > 120 ? `${json.slice(0, 120)}…` : json;
};

const summarizeResult = (result: ModelContextToolResult) => {
  const text = result.content.map((c) => c.text).join(" ");
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
};

/**
 * Registers every WebMCP tool this app exposes. No-ops (returns false)
 * outside a WebMCP-capable browser agent so the app behaves identically
 * for everyone else -- WebMCP is additive, never load-bearing for the UI.
 */
export async function registerWebmcpTools(
  ctx: ToolContext,
  onEvent: (event: Omit<ToolActivityEvent, "id" | "at">) => void,
  signal: AbortSignal
): Promise<boolean> {
  if (typeof document === "undefined" || typeof document.modelContext?.registerTool !== "function") {
    return false;
  }

  for (const factory of TOOL_FACTORIES) {
    const tool = factory(ctx);

    const execute: ModelContextTool["execute"] = async (input, agent) => {
      try {
        const result = await tool.execute(input, agent);

        onEvent({
          kind: "call",
          toolName: tool.name,
          summary: `${summarizeInput(input)} → ${summarizeResult(result)}`,
          status: result.isError ? "error" : "success",
        });

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        onEvent({
          kind: "call",
          toolName: tool.name,
          summary: `${summarizeInput(input)} → ${message}`,
          status: "error",
        });

        return errorResult(clampOutput(`Unexpected error: ${message}`));
      }
    };

    // eslint-disable-next-line no-await-in-loop
    await document.modelContext.registerTool({ ...tool, execute }, { signal });

    onEvent({ kind: "registered", toolName: tool.name, summary: tool.description });
  }

  return true;
}
