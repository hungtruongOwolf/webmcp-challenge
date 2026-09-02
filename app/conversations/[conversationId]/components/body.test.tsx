import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
