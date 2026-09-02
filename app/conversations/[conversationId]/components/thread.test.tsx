import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Conversation, FullMessageType, User } from "@/app/types";

import Thread from "./thread";

const broadcastHandlers = vi.hoisted(() => ({
  current: [] as Array<(msg: { payload: unknown }) => void>,
}));

vi.mock("axios", () => ({ default: { post: vi.fn(async () => ({ data: {} })) } }));

vi.mock("@/app/hooks/use-conversation", () => ({
  default: () => ({ conversationId: "conv-1", isOpen: true }),
}));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: (_type: string, _filter: unknown, handler: (msg: { payload: unknown }) => void) => {
        broadcastHandlers.current.push(handler);
        return { subscribe: () => undefined };
      },
    }),
    removeChannel: () => undefined,
  }),
}));

// Only the message list matters here; the rest of the thread is chrome.
vi.mock("./header", () => ({ default: () => null }));
vi.mock("./form", () => ({ default: () => null }));
vi.mock("./profile-drawer", () => ({ default: () => null }));
vi.mock("./lightbox", () => ({ default: () => null }));
vi.mock("./body", () => ({
  default: ({ messages }: { messages: FullMessageType[] }) => (
    <ul>
      {messages.map((m) => (
        <li key={m.id} data-testid="message">
          {m.deleted_at ? "This message was deleted." : m.body}
          {m.edited_at ? " (edited)" : ""}
        </li>
      ))}
    </ul>
  ),
}));

const grace: User = {
  id: "other-id",
  name: "Grace",
  email: "grace@example.org",
  image: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

const conversation = {
  id: "conv-1",
  name: null,
  is_group: false,
  created_at: "2026-09-01T00:00:00.000Z",
  last_message_at: "2026-09-02T09:00:00.000Z",
  users: [grace],
} as unknown as Conversation & { users: User[] };

// The bare table row, as a broadcast carries it (no joined sender/seen/reactions).
const row = {
  id: "m1",
  conversation_id: "conv-1",
  sender_id: grace.id,
  body: "hello" as string | null,
  image: null,
  file_url: null,
  file_name: null,
  file_size: null,
  created_at: "2026-09-02T09:00:00.000Z",
  edited_at: null as string | null,
  deleted_at: null as string | null,
};

const message = (overrides: Partial<FullMessageType>): FullMessageType => ({
  ...row,
  sender: grace,
  seen: [],
  reactions: [],
  ...overrides,
});

const emitBroadcast = (payload: unknown) => {
  act(() => {
    broadcastHandlers.current.forEach((handler) => handler({ payload }));
  });
};

describe("Thread realtime updates", () => {
  beforeEach(() => {
    broadcastHandlers.current = [];
  });

  it("merges an UPDATE broadcast into the existing row instead of appending", () => {
    render(<Thread conversation={conversation} initialMessages={[message({})]} />);
    expect(screen.getAllByTestId("message")).toHaveLength(1);

    emitBroadcast({
      table: "messages",
      operation: "UPDATE",
      record: { ...row, body: "hello again", edited_at: "2026-09-02T09:05:00.000Z" },
      old_record: row,
    });

    const items = screen.getAllByTestId("message");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("hello again (edited)");

    emitBroadcast({
      table: "messages",
      operation: "UPDATE",
      record: { ...row, body: null, deleted_at: "2026-09-02T09:06:00.000Z" },
      old_record: { ...row, body: "hello again" },
    });

    expect(screen.getAllByTestId("message")).toHaveLength(1);
    expect(screen.getByTestId("message")).toHaveTextContent("This message was deleted.");
  });

  it("appends a genuine INSERT from a member of the conversation", () => {
    render(<Thread conversation={conversation} initialMessages={[message({})]} />);

    emitBroadcast({
      table: "messages",
      operation: "INSERT",
      record: { ...row, id: "m2", body: "second" },
    });

    const items = screen.getAllByTestId("message");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent("second");
  });
});
