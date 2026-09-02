import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthGateway, AuthResult } from "@/app/libs/auth/auth-gateway";
import type { PasskeyReadiness } from "@/app/libs/auth/passkey-readiness";
import { WebMCPConnectionProvider } from "@/app/webmcp/connection-provider";
import { ConnectionStatusIndicator } from "@/app/webmcp/connection-status-indicator";

import PasskeyManager from "./passkey-manager";

const navigation = vi.hoisted(() => ({ pathname: "/users" }));
const browser = vi.hoisted(() => ({
  readiness: {
    status: "ready",
    message: "Passkeys are available.",
  } as PasskeyReadiness,
}));
const supabaseBoundary = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  register: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("@/app/hooks/use-passkey-readiness", () => ({
  usePasskeyReadiness: () => browser.readiness,
}));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({
    auth: {
      registerPasskey: supabaseBoundary.register,
      passkey: {
        list: supabaseBoundary.list,
        delete: supabaseBoundary.remove,
      },
    },
  }),
}));

const passkey = {
  id: "passkey-1",
  friendly_name: "Laptop",
  created_at: "2026-08-30T12:00:00.000Z",
  last_used_at: "2026-08-30T12:30:00.000Z",
};

const success: AuthResult = { ok: true, value: undefined };

const createGateway = (overrides: Partial<AuthGateway> = {}): AuthGateway => ({
  signInWithPasskey: async () => success,
  signInWithPassword: async () => success,
  signUpWithPassword: async () => ({
    ok: true,
    value: { hasSession: true },
  }),
  signUpWithPasskey: async () => ({
    ok: true,
    value: { hasSession: true },
  }),
  registerPasskey: async () => success,
  listPasskeys: async () => ({ ok: true, value: [passkey] }),
  deletePasskey: async () => success,
  ...overrides,
});

const managerTree = (gateway?: AuthGateway) => (
    <WebMCPConnectionProvider modelContext={null} currentUserId="user-a">
      <ConnectionStatusIndicator />
      <PasskeyManager gateway={gateway} />
    </WebMCPConnectionProvider>
);

const renderManager = (gateway?: AuthGateway) => render(managerTree(gateway));

const waitForProvider = () =>
  waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Signed in. Verb is ready; agent tools are unavailable in this browser."
    )
  );

describe("PasskeyManager", () => {
  beforeEach(() => {
    browser.readiness = {
      status: "ready",
      message: "Passkeys are available.",
    };
    vi.stubGlobal("PublicKeyCredential", class PublicKeyCredential {});
    supabaseBoundary.list.mockResolvedValue({ data: [passkey], error: null });
    supabaseBoundary.remove.mockResolvedValue({ data: null, error: null });
    supabaseBoundary.register.mockResolvedValue({ data: null, error: null });
  });

  it("renders without constructing a default gateway on the server", () => {
    const originalWindow = globalThis.window;
    const originalOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
    delete process.env.NEXT_PUBLIC_APP_ORIGIN;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });

    try {
      expect(() => renderToString(managerTree())).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
      if (originalOrigin === undefined) {
        delete process.env.NEXT_PUBLIC_APP_ORIGIN;
      } else {
        process.env.NEXT_PUBLIC_APP_ORIGIN = originalOrigin;
      }
    }
  });

  it("announces the final readiness transition through the shared live region", async () => {
    browser.readiness = {
      status: "checking",
      message: "Checking passkey support…",
    };
    const gateway = createGateway();
    const view = renderManager(gateway);
    await waitForProvider();

    browser.readiness = {
      status: "unsupported",
      message:
        "Passkeys are not supported in this browser. Use a password instead.",
    };
    view.rerender(managerTree(gateway));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Passkeys are not supported in this browser. Use a password instead."
      )
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("keeps existing passkeys removable when enrollment is unsupported", async () => {
    browser.readiness = {
      status: "unsupported",
      message:
        "Passkeys are not supported in this browser. Use a password instead.",
    };
    vi.stubGlobal("PublicKeyCredential", undefined);

    renderManager(createGateway());
    await waitForProvider();

    expect(await screen.findByText("Laptop")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Laptop" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add a passkey" })).toBeDisabled();
    expect(screen.getByText(browser.readiness.message)).toBeVisible();
  });

  it("announces successful removal and refreshes the visible list", async () => {
    const user = userEvent.setup();
    const listPasskeys = vi
      .fn<AuthGateway["listPasskeys"]>()
      .mockResolvedValueOnce({ ok: true, value: [passkey] })
      .mockResolvedValueOnce({ ok: true, value: [] });
    renderManager(
      createGateway({
        listPasskeys,
        deletePasskey: async () => success,
      })
    );
    await waitForProvider();

    await user.click(
      await screen.findByRole("button", { name: "Remove Laptop" })
    );

    expect(screen.getByRole("status")).toHaveTextContent("Passkey removed.");
    expect(
      await screen.findByText("No passkeys yet on this account.")
    ).toBeVisible();
  });
});
