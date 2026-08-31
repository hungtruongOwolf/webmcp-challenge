import { expect, it, vi } from "vitest";
import { defaultToolRegistry } from "./tool-registry";

const getSnapshot = vi.fn(() => ({
  authenticated: false,
  state: "SIGNED_OUT" as const,
  route: "/",
  nextAction: "sign_in_on_page" as const,
}));

it("ships only connection status in public and authenticated scopes", () => {
  expect(defaultToolRegistry.getPublicTools({ getSnapshot }).map((tool) => tool.name)).toEqual([
    "get_connection_status",
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
