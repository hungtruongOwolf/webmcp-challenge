import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { FullMessageType, User } from "@/app/types";

import Body from "./body";

vi.mock("@/app/context/current-user-context", () => ({
  useCurrentUser: () => ({ id: "me-id", email: "me@example.org" }),
}));

vi.mock("@/app/context/ui-settings-context", () => ({
  useUiSettings: () => ({ theme: "light" }),
}));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({}),
}));

const grace: User = {
  id: "other-id",
  name: "Grace",
  email: "grace@example.org",
  image: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

const message = (overrides: Partial<FullMessageType>): FullMessageType => ({
  id: "m1",
  conversation_id: "conv-1",
  sender_id: grace.id,
  body: "hello",
  image: null,
  file_url: null,
  file_name: null,
  file_size: null,
  created_at: "2026-09-02T09:00:00.000Z",
  edited_at: null,
  deleted_at: null,
  sender: grace,
  seen: [],
  reactions: [],
  ...overrides,
});

describe("Body", () => {
  beforeAll(() => {
    // jsdom has no layout, so the auto-scroll hook needs a stand-in.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("marks an edited message", () => {
    render(
      <Body
        messages={[message({ body: "hello again", edited_at: "2026-09-02T09:05:00.000Z" })]}
        onOpenImage={() => {}}
      />
    );

    expect(screen.getByText("hello again")).toBeInTheDocument();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });

  it("links a file so the browser downloads it instead of rendering it", () => {
    render(
      <Body
        messages={[
          message({
            body: null,
            file_url: "https://abc.supabase.co/storage/v1/object/sign/chat-files/conv-1/other/x-notes.txt?token=t",
            file_name: "notes.txt",
            file_size: 12,
          }),
        ]}
        onOpenImage={() => {}}
      />
    );

    const link = screen.getByRole("link", { name: /notes\.txt/ });
    expect(link).toHaveAttribute("href", expect.stringMatching(/[?&]download$/));
  });

  it("renders a deleted message as a short placeholder with no content", () => {
    render(
      <Body
        messages={[message({ body: null, deleted_at: "2026-09-02T09:05:00.000Z" })]}
        onOpenImage={() => {}}
      />
    );

    expect(screen.getByText("This message was deleted.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /react/i })).not.toBeInTheDocument();
  });
});
