import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { FullConversationType, User } from "@/app/types";
import {
  ConversationsProvider,
  useConversationsList,
} from "@/app/context/conversations-context";

const currentUser = vi.hoisted(() => ({
  id: "me",
  name: "Me",
  email: "me@example.org",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ conversationId: openConversationId.current }),
}));

vi.mock("@/app/context/current-user-context", () => ({
  useCurrentUser: () => currentUser,
}));

const broadcastHandlers = vi.hoisted(() => ({ current: [] as Array<(msg: unknown) => void> }));
const statusHandlers = vi.hoisted(() => ({ current: [] as Array<(status: string) => void> }));
const openConversationId = vi.hoisted(() => ({ current: undefined as string | undefined }));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: (
        _type: string,
        _filter: unknown,
        handler: (msg: unknown) => void
      ) => {
        broadcastHandlers.current.push(handler);
        return {
          subscribe: (onStatus?: (status: string) => void) => {
            if (onStatus) statusHandlers.current.push(onStatus);
          },
        };
      },
    }),
    removeChannel: () => undefined,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}));

const otherUser: User = {
  id: "other",
  name: "Grace",
  email: "grace@example.org",
  image: null,
  created_at: "2026-08-30T00:00:00.000Z",
  updated_at: "2026-08-30T00:00:00.000Z",
} as User;

const makeConversation = (id: string): FullConversationType =>
  ({
    id,
    is_group: false,
    name: null,
    created_at: "2026-08-30T00:00:00.000Z",
    last_message_at: "2026-08-30T00:00:00.000Z",
    users: [otherUser],
    messages: [],
  }) as unknown as FullConversationType;

const inboxAccess = {
  current: null as Pick<
    ReturnType<typeof useConversationsList>,
    "subscribeToInbox" | "isInboxLive"
  > | null,
};

const Consumer = () => {
  const { newMessageAnnouncement, subscribeToInbox, isInboxLive } = useConversationsList();
  inboxAccess.current = { subscribeToInbox, isInboxLive };
  return <div data-testid="announcement">{newMessageAnnouncement}</div>;
};

const renderProvider = (conversations: FullConversationType[]) =>
  render(
    <ConversationsProvider initialConversations={conversations}>
      <Consumer />
    </ConversationsProvider>
  );

const emitBroadcast = (payload: unknown) => {
  act(() => {
    broadcastHandlers.current.forEach((handler) => handler({ payload }));
  });
};

const emitStatus = (status: string) => {
  act(() => {
    statusHandlers.current.forEach((handler) => handler(status));
  });
};

describe("ConversationsProvider inbox feed", () => {
  beforeEach(() => {
    broadcastHandlers.current = [];
    statusHandlers.current = [];
    inboxAccess.current = null;
    openConversationId.current = undefined;
  });

  it("shares its own inbox channel with tools instead of letting them open one", () => {
    renderProvider([makeConversation("convo-a")]);
    const received: unknown[] = [];
    const unsubscribe = inboxAccess.current!.subscribeToInbox((event) => received.push(event));

    expect(inboxAccess.current!.isInboxLive()).toBe(false);
    emitStatus("SUBSCRIBED");
    expect(inboxAccess.current!.isInboxLive()).toBe(true);

    const payload = {
      table: "messages",
      operation: "INSERT",
      record: { conversation_id: "convo-a", sender_id: "other", body: "hi" },
    };
    emitBroadcast(payload);
    emitStatus("CHANNEL_ERROR");

    expect(received).toEqual([
      { type: "status", live: true },
      { type: "broadcast", payload },
      { type: "status", live: false },
    ]);
    expect(inboxAccess.current!.isInboxLive()).toBe(false);

    unsubscribe();
    emitBroadcast(payload);
    expect(received).toHaveLength(3);
  });
});

describe("ConversationsProvider new-message announcement", () => {
  beforeEach(() => {
    broadcastHandlers.current = [];
    statusHandlers.current = [];
    openConversationId.current = undefined;
  });

  it("announces a message that arrives in a conversation the user isn't viewing", () => {
    openConversationId.current = "convo-b";
    renderProvider([makeConversation("convo-a")]);

    emitBroadcast({
      table: "messages",
      record: {
        conversation_id: "convo-a",
        sender_id: "other",
        body: "are you free tonight?",
      },
    });

    expect(screen.getByTestId("announcement")).toHaveTextContent(
      "New message from Grace: are you free tonight?"
    );
  });

  it("does not announce a message in the conversation currently open", () => {
    openConversationId.current = "convo-a";
    renderProvider([makeConversation("convo-a")]);

    emitBroadcast({
      table: "messages",
      record: {
        conversation_id: "convo-a",
        sender_id: "other",
        body: "are you free tonight?",
      },
    });

    expect(screen.getByTestId("announcement")).toHaveTextContent("");
  });

  it("does not announce the current user's own message", () => {
    openConversationId.current = "convo-b";
    renderProvider([makeConversation("convo-a")]);

    emitBroadcast({
      table: "messages",
      record: {
        conversation_id: "convo-a",
        sender_id: "me",
        body: "on my way",
      },
    });

    expect(screen.getByTestId("announcement")).toHaveTextContent("");
  });

  it("does not announce an UPDATE broadcast such as an edit or soft delete", () => {
    openConversationId.current = "convo-b";
    renderProvider([makeConversation("convo-a")]);

    emitBroadcast({
      table: "messages",
      operation: "UPDATE",
      record: {
        conversation_id: "convo-a",
        sender_id: "other",
        body: "are you free tonight? (fixed typo)",
      },
      old_record: {
        conversation_id: "convo-a",
        sender_id: "other",
        body: "are you free tonite?",
      },
    });

    expect(screen.getByTestId("announcement")).toHaveTextContent("");
  });

  it("does not announce a payload carrying old_record, like the read-receipt re-broadcast", () => {
    openConversationId.current = "convo-b";
    renderProvider([makeConversation("convo-a")]);

    emitBroadcast({
      table: "messages",
      record: {
        conversation_id: "convo-a",
        sender_id: "other",
        body: "are you free tonight?",
      },
      old_record: {
        conversation_id: "convo-a",
        sender_id: "other",
        body: "are you free tonight?",
      },
    });

    expect(screen.getByTestId("announcement")).toHaveTextContent("");
  });

  it("describes an image or file when there is no text body", () => {
    openConversationId.current = "convo-b";
    renderProvider([makeConversation("convo-a")]);

    emitBroadcast({
      table: "messages",
      record: {
        conversation_id: "convo-a",
        sender_id: "other",
        image: "https://example.org/photo.jpg",
      },
    });

    expect(screen.getByTestId("announcement")).toHaveTextContent(
      "New message from Grace: sent a photo"
    );
  });
});
