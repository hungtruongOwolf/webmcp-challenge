import { expect, it, vi } from "vitest";
import { defaultToolRegistry } from "./tool-registry";

const getSnapshot = vi.fn(() => ({
  authenticated: false,
  state: "SIGNED_OUT" as const,
  route: "/",
  nextAction: "sign_in_on_page" as const,
  guidance: "Sign-in requires the human, not the agent.",
}));

it("ships connection status plus sign-up in the public scope, only connection status once authenticated", () => {
  expect(defaultToolRegistry.getPublicTools({ getSnapshot }).map((tool) => tool.name)).toEqual([
    "get_connection_status",
    "sign_up",
  ]);
  expect(
    defaultToolRegistry
      .getAuthenticatedTools({
        getSnapshot,
        apiClient: { request: vi.fn() },
      })
      .map((tool) => tool.name)
  ).toEqual(["get_connection_status"]);
});
