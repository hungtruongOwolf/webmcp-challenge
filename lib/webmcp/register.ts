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
import { readFile } from "@/lib/webmcp/tools/read-file";
import { readLink } from "@/lib/webmcp/tools/read-link";

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
  readFile,
  readLink,
];

const summarizeInput = (input: Record<string, unknown>) => {
  const keys = Object.keys(input ?? {}).sort();
  return keys.length === 0 ? "no input" : `fields: ${keys.join(", ")}`;
};

const summarizeResult = (result: ModelContextToolResult) => {
  return result.isError ? "tool returned an error" : "completed";
};

/**
 * Builds the authenticated Messenger catalog. Registration and teardown are
 * owned by WebMCPConnectionProvider so every tool shares one session scope.
 */
export function createWebmcpTools(
  ctx: ToolContext,
  onEvent: (event: Omit<ToolActivityEvent, "id" | "at">) => void
): ModelContextTool[] {
  return TOOL_FACTORIES.map((factory) => {
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
          summary: `${summarizeInput(input)} → tool threw an error`,
          status: "error",
        });

        return errorResult(clampOutput(`Unexpected error: ${message}`));
      }
    };

    return { ...tool, execute };
  });
}
