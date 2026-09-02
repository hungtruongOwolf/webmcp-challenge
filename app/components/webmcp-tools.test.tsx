import { render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import WebmcpTools from "./webmcp-tools";

const bridge = vi.hoisted(() => ({
  replaceAuthenticatedTools: vi.fn(),
  setEnabled: vi.fn(),
  registerTool: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/context/current-user-context", () => ({
  useCurrentUser: () => ({ id: "user-a", email: "blind.user@example.org" }),
}));

vi.mock("@/app/context/confirm-bridge-context", () => ({
  useConfirmBridge: () => ({ requestConfirmation: vi.fn() }),
}));

vi.mock("@/app/context/webmcp-activity-context", () => ({
  useWebmcpActivity: () => ({
    logEvent: vi.fn(),
    setEnabled: bridge.setEnabled,
  }),
}));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({}),
}));

vi.mock("@/app/webmcp/connection-provider", () => ({
  useWebMCPConnection: () => ({
    state: { status: "CONNECTED", userId: "user-a" },
    replaceAuthenticatedTools: bridge.replaceAuthenticatedTools,
  }),
}));

vi.mock("@/lib/webmcp/register", () => ({
  createWebmcpTools: () => [
    {
      name: "list_conversations",
      description: "List conversations",
      execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
    },
  ],
}));

beforeEach(() => {
  bridge.replaceAuthenticatedTools.mockReset();
  bridge.setEnabled.mockReset();
  bridge.registerTool.mockReset();
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: { registerTool: bridge.registerTool },
  });
  delete (window as Window & { __webmcpDebugRegister?: unknown })
    .__webmcpDebugRegister;
});

it("supplies the catalog to the session provider without registering or adding a debug hook", async () => {
  const { unmount } = render(<WebmcpTools />);

  await waitFor(() =>
    expect(bridge.replaceAuthenticatedTools).toHaveBeenCalledWith([
      expect.objectContaining({ name: "list_conversations" }),
    ])
  );
  expect(bridge.setEnabled).toHaveBeenCalledWith(true);
  expect(bridge.registerTool).not.toHaveBeenCalled();
  expect(
    (window as Window & { __webmcpDebugRegister?: unknown })
      .__webmcpDebugRegister
  ).toBeUndefined();

  unmount();
  expect(bridge.replaceAuthenticatedTools).toHaveBeenLastCalledWith([]);
});

it("keeps one catalog across rerenders even when hook results change identity", async () => {
  const { rerender } = render(<WebmcpTools />);
  await waitFor(() =>
    expect(bridge.replaceAuthenticatedTools).toHaveBeenCalledTimes(1)
  );

  // The mocked useRouter/useConfirmBridge hand back fresh objects on every
  // render, which is what a route change does to a consumer.
  rerender(<WebmcpTools />);
  rerender(<WebmcpTools />);

  expect(bridge.replaceAuthenticatedTools).toHaveBeenCalledTimes(1);
});
