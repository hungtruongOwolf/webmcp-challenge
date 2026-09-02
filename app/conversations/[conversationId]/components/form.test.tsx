import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Form from "./form";

const session = vi.hoisted(() => ({
  currentUser: { id: "me" } as { id: string },
}));

const drafts = vi.hoisted(() => ({
  body: null as string | null,
}));

vi.mock("axios", () => ({
  default: { post: vi.fn(async () => ({ data: {} })) },
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn() },
}));

vi.mock("@/app/hooks/use-conversation", () => ({
  default: () => ({ conversationId: "conversation-1", isOpen: true }),
}));

vi.mock("@/app/context/current-user-context", () => ({
  useCurrentUser: () => session.currentUser,
}));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: drafts.body === null ? null : { body: drafts.body },
            }),
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ then: (done: () => void) => done() }),
          }),
        }),
      }),
    }),
  }),
}));

// Mirrors an agent or test harness writing straight to the DOM node. React's
// own value tracker swallows the input event this way, so the component only
// sees the text if it reads the element instead of trusting its state.
const placeTextWithoutReact = (input: HTMLInputElement, text: string) => {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("message Form", () => {
  beforeEach(() => {
    session.currentUser = { id: "me" };
    drafts.body = null;
  });

  it("sends a draft saved by the draft_message tool when Send is clicked", async () => {
    const user = userEvent.setup();
    drafts.body = "hello from the agent";
    render(<Form />);

    await waitFor(() =>
      expect(screen.getByLabelText("Type a message")).toHaveValue(
        "hello from the agent"
      )
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(axios.post).toHaveBeenCalledWith("/api/messages", {
      message: "hello from the agent",
      conversationId: "conversation-1",
    });
  });

  it("sends text placed on the input without React events when Send is clicked", async () => {
    const user = userEvent.setup();
    render(<Form />);

    placeTextWithoutReact(
      screen.getByLabelText<HTMLInputElement>("Type a message"),
      "placed by automation"
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(axios.post).toHaveBeenCalledWith("/api/messages", {
      message: "placed by automation",
      conversationId: "conversation-1",
    });
  });

  it("keeps programmatic text through a rerender and still sends it", async () => {
    const user = userEvent.setup();
    const view = render(<Form />);

    placeTextWithoutReact(
      screen.getByLabelText<HTMLInputElement>("Type a message"),
      "placed by automation"
    );
    // Thread rerenders Form on every realtime event and token refresh.
    view.rerender(<Form />);
    view.rerender(<Form />);

    expect(screen.getByLabelText("Type a message")).toHaveValue("placed by automation");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(axios.post).toHaveBeenCalledWith("/api/messages", {
      message: "placed by automation",
      conversationId: "conversation-1",
    });
  });

  it("lights up the Send button for programmatic text and dims it after sending", async () => {
    const user = userEvent.setup();
    render(<Form />);
    const send = screen.getByRole("button", { name: "Send message" });
    expect(send).toHaveStyle({ cursor: "default" });

    placeTextWithoutReact(
      screen.getByLabelText<HTMLInputElement>("Type a message"),
      "placed by automation"
    );
    expect(send).toHaveStyle({ cursor: "pointer" });

    await user.click(send);

    await waitFor(() => expect(send).toHaveStyle({ cursor: "default" }));
    expect(screen.getByLabelText("Type a message")).toHaveValue("");
  });

  it("sends the same programmatic text on Enter", async () => {
    const user = userEvent.setup();
    render(<Form />);
    const input = screen.getByLabelText<HTMLInputElement>("Type a message");

    placeTextWithoutReact(input, "placed by automation");
    input.focus();
    await user.keyboard("{Enter}");

    expect(axios.post).toHaveBeenCalledWith("/api/messages", {
      message: "placed by automation",
      conversationId: "conversation-1",
    });
  });

  it("does nothing on an empty submit", async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(axios.post).not.toHaveBeenCalled();
  });

  it("keeps a typed draft when the session refreshes with the same user", async () => {
    const user = userEvent.setup();
    const view = render(<Form />);

    await user.type(screen.getByLabelText("Type a message"), "still here");
    session.currentUser = { id: "me" };
    view.rerender(<Form />);

    await waitFor(() =>
      expect(screen.getByLabelText("Type a message")).toHaveValue("still here")
    );
  });
});
