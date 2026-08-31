import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { markFocusAfterAuth } from "@/app/libs/auth/focus-after-auth";

import { FocusAfterAuth } from "./focus-after-auth";

beforeEach(() => {
  sessionStorage.clear();
  document.cookie = "messenger_focus_after_auth=; Max-Age=0; Path=/";
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

it("consumes a server callback focus handoff exactly once", async () => {
  document.cookie = "messenger_focus_after_auth=1; Path=/; SameSite=Lax";
  const { rerender } = render(
    <>
      <FocusAfterAuth pathname="/conversations" />
      <h1 key="conversations" data-page-title tabIndex={-1}>
        Conversations
      </h1>
    </>
  );

  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus()
  );
  expect(document.cookie).not.toContain("messenger_focus_after_auth=1");

  rerender(
    <>
      <FocusAfterAuth pathname="/users" />
      <h1 key="users" data-page-title tabIndex={-1}>
        People
      </h1>
    </>
  );
  expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
});

it("focuses the destination page title once", async () => {
  markFocusAfterAuth();
  const { rerender } = render(
    <>
      <FocusAfterAuth pathname="/conversations" />
      <h1 key="conversations" data-page-title tabIndex={-1}>
        Conversations
      </h1>
    </>
  );
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus()
  );
  rerender(
    <>
      <FocusAfterAuth pathname="/users" />
      <h1 key="users" data-page-title tabIndex={-1}>
        People
      </h1>
    </>
  );
  expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
});

it("falls back to main content when the destination has no page title", async () => {
  markFocusAfterAuth();
  render(
    <>
      <FocusAfterAuth pathname="/conversations/missing" />
      <main id="main-content" tabIndex={-1}>
        Conversation
      </main>
    </>
  );

  await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
});
