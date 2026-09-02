import { describe, expect, it, vi } from "vitest";

import { createWebmcpTools } from "./register";
import type { ToolContext } from "./types";

describe("createWebmcpTools", () => {
  it("builds the complete Messenger catalog without the provider-owned status tool", () => {
    const onEvent = vi.fn();
    const tools = createWebmcpTools({} as ToolContext, onEvent);

    expect(tools.map((tool) => tool.name)).toEqual([
      "list_conversations",
      "read_conversation",
      "search_messages",
      "search_people",
      "list_people",
      "get_my_profile",
      "open_conversation",
      "start_conversation",
      "create_group",
      "draft_message",
      "send_message",
      "send_attachment",
      "forward_message",
      "delete_conversation",
      "describe_image",
      "read_file",
      "read_link",
      "sign_out",
      "setup_passkey",
      "react_to_message",
      "send_sticker",
      "summarize_conversation",
      "wait_for_new_messages",
    ]);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
