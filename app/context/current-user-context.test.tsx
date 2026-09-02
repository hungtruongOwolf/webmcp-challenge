import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";

import { consumeFocusAfterSignOut } from "@/app/libs/auth/focus-after-auth";

import { CurrentUserProvider, useCurrentUser } from "./current-user-context";

type AuthListener = (event: string, session: Session | null) => void;

const auth = vi.hoisted(() => ({
  listener: null as AuthListener | null,
}));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (listener: AuthListener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
}));

const WhoAmI = () => {
  const user = useCurrentUser();
  return <p>{user ? `Signed in as ${user.id}` : "Signed out"}</p>;
};

beforeEach(() => {
  sessionStorage.clear();
  auth.listener = null;
});

it("marks a sign-out handoff so the sign-in page can focus and announce it", () => {
  render(
    <CurrentUserProvider initialUser={{ id: "tony" } as User}>
      <WhoAmI />
    </CurrentUserProvider>
  );
  expect(screen.getByText("Signed in as tony")).toBeVisible();

  act(() => auth.listener?.("SIGNED_OUT", null));

  expect(screen.getByText("Signed out")).toBeVisible();
  expect(consumeFocusAfterSignOut()).toBe(true);
});

it("does not mark a handoff when the first session check simply finds nobody", () => {
  render(
    <CurrentUserProvider initialUser={null}>
      <WhoAmI />
    </CurrentUserProvider>
  );

  act(() => auth.listener?.("INITIAL_SESSION", null));

  expect(consumeFocusAfterSignOut()).toBe(false);
});
