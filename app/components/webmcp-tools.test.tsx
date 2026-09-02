import { render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/webmcp/types";

import WebmcpTools from "./webmcp-tools";

const bridge = vi.hoisted(() => ({
  replaceAuthenticatedTools: vi.fn(),
  setEnabled: vi.fn(),
  registerTool: vi.fn(),
}));

// Fresh objects per render, the way a route change looks to a consumer;
// tests swap them to prove the catalog reads the newest one.
const hooks = vi.hoisted(() => ({
  router: { push: vi.fn() },
  inbox: { subscribeToInbox: vi.fn(() => () => undefined), isInboxLive: vi.fn(() => false) },
}));

const catalog = vi.hoisted(() => ({ ctx: null as ToolContext | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => hooks.router,
}));

vi.mock("@/app/context/current-user-context", () => ({
  useCurrentUser: () => ({ id: "user-a", email: "blind.user@example.org" }),
}));

vi.mock("@/app/context/confirm-bridge-context", () => ({
  useConfirmBridge: () => ({ requestConfirmation: vi.fn() }),
}));

vi.mock("@/app/context/conversations-context", () => ({
  useConversationsList: () => hooks.inbox,
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
  createWebmcpTools: (ctx: ToolContext) => {
    catalog.ctx = ctx;
    return [
      {
        name: "list_conversations",
        description: "List conversations",
        execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
      },
    ];
  },
}));

beforeEach(() => {
  bridge.replaceAuthenticatedTools.mockReset();
  bridge.setEnabled.mockReset();
  bridge.registerTool.mockReset();
  hooks.router = { push: vi.fn() };
  hooks.inbox = { subscribeToInbox: vi.fn(() => () => undefined), isInboxLive: vi.fn(() => false) };
  catalog.ctx = null;
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

  hooks.router = { push: vi.fn() };
  rerender(<WebmcpTools />);
  hooks.router = { push: vi.fn() };
  rerender(<WebmcpTools />);

  expect(bridge.replaceAuthenticatedTools).toHaveBeenCalledTimes(1);
});

it("routes the catalog's context through whatever the latest render provided", async () => {
  const { rerender } = render(<WebmcpTools />);
  await waitFor(() => expect(catalog.ctx).not.toBeNull());
  const staleRouter = hooks.router;
  const staleInbox = hooks.inbox;

  hooks.router = { push: vi.fn() };
  hooks.inbox = { subscribeToInbox: vi.fn(() => () => undefined), isInboxLive: vi.fn(() => true) };
  rerender(<WebmcpTools />);

  catalog.ctx!.navigate("/conversations/c1");
  const listener = () => undefined;
  catalog.ctx!.subscribeToInbox(listener);

  expect(hooks.router.push).toHaveBeenCalledWith("/conversations/c1");
  expect(staleRouter.push).not.toHaveBeenCalled();
  expect(hooks.inbox.subscribeToInbox).toHaveBeenCalledWith(listener);
  expect(staleInbox.subscribeToInbox).not.toHaveBeenCalled();
  expect(catalog.ctx!.isInboxLive()).toBe(true);
});
