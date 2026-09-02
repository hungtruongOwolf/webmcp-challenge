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
      "edit_message",
      "delete_message",
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

  it("flags every tool whose result carries text another user wrote", () => {
    const tools = createWebmcpTools({} as ToolContext, vi.fn());
    const flagged = tools
      .filter((tool) => tool.annotations?.untrustedContentHint === true)
      .map((tool) => tool.name)
      .sort();

    expect(flagged).toEqual(
      [
        "delete_message",
        "describe_image",
        "forward_message",
        "list_conversations",
        "list_people",
        "open_conversation",
        "react_to_message",
        "read_conversation",
        "read_file",
        "read_link",
        "search_messages",
        "search_people",
        "send_attachment",
        "send_message",
        "start_conversation",
        "summarize_conversation",
        "wait_for_new_messages",
      ].sort()
    );
  });
});
