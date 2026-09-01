import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthGateway, AuthResult } from "@/app/libs/auth/auth-gateway";
import { consumeFocusAfterAuth } from "@/app/libs/auth/focus-after-auth";
import type { PasskeyReadiness } from "@/app/libs/auth/passkey-readiness";
import { WebMCPConnectionProvider } from "@/app/webmcp/connection-provider";
import { ConnectionStatusIndicator } from "@/app/webmcp/connection-status-indicator";

import { PasskeyEnrollment } from "./passkey-enrollment";

const navigation = vi.hoisted(() => ({
  pathname: "/auth/passkey",
  replace: vi.fn(),
}));

const browser = vi.hoisted(() => ({
  readiness: {
    status: "ready",
    message: "Passkeys are available.",
  } as PasskeyReadiness,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

vi.mock("@/app/hooks/use-passkey-readiness", () => ({
  usePasskeyReadiness: () => browser.readiness,
}));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPasskey: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOtp: vi.fn(),
      registerPasskey: vi.fn(),
      passkey: { list: vi.fn(), delete: vi.fn() },
    },
  }),
}));

const success: AuthResult = { ok: true, value: undefined };

const createGateway = (
  registerPasskey: AuthGateway["registerPasskey"] = async () => success
): AuthGateway => ({
  signInWithPasskey: async () => success,
  signInWithPassword: async () => success,
  signUpWithPassword: async () => ({
    ok: true,
    value: { hasSession: true },
  }),
  registerPasskey,
  listPasskeys: async () => ({ ok: true, value: [] }),
  deletePasskey: async () => success,
});

const enrollmentTree = (gateway?: AuthGateway, returnPath = "/users") => (
    <WebMCPConnectionProvider modelContext={null} currentUserId="user-a">
      <ConnectionStatusIndicator />
      <PasskeyEnrollment returnPath={returnPath} gateway={gateway} />
    </WebMCPConnectionProvider>
);

const renderEnrollment = (gateway?: AuthGateway, returnPath = "/users") =>
  render(enrollmentTree(gateway, returnPath));

const waitForProvider = () =>
  waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Signed in. Verb is ready; agent tools are unavailable in this browser."
    )
  );

describe("PasskeyEnrollment", () => {
  beforeEach(() => {
    navigation.replace.mockReset();
    browser.readiness = {
      status: "ready",
      message: "Passkeys are available.",
    };
    sessionStorage.clear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it("enables setup when passkeys are ready", async () => {
    renderEnrollment(createGateway());
    await waitForProvider();

    expect(screen.getByRole("button", { name: "Set up passkey" })).toBeEnabled();
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
      expect(() => renderToString(enrollmentTree())).not.toThrow();
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
    const view = renderEnrollment(gateway);
    await waitForProvider();

    browser.readiness = {
      status: "ready",
      message: "Passkeys are available.",
    };
    view.rerender(enrollmentTree(gateway));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Passkeys are available."
      )
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("announces success and replaces with a sanitized destination", async () => {
    const user = userEvent.setup();
    renderEnrollment(createGateway(), "https://attacker.example/private");
    await waitForProvider();

    await user.click(screen.getByRole("button", { name: "Set up passkey" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Passkey saved. Next time, one action."
    );
    expect(consumeFocusAfterAuth()).toBe(true);
    expect(navigation.replace).toHaveBeenCalledWith("/conversations");
  });

  it("announces cancellation and restores focus to setup", async () => {
    const user = userEvent.setup();
    const gateway = createGateway(async () => ({
      ok: false,
      code: "PASSKEY_CANCELLED",
    }));
    renderEnrollment(gateway);
    await waitForProvider();
    const setupButton = screen.getByRole("button", { name: "Set up passkey" });

    await user.click(setupButton);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Passkey sign-in cancelled. Choose another sign-in method when ready."
    );
    await waitFor(() => expect(setupButton).toHaveFocus());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("focuses a normalized alert when passkey enrollment fails", async () => {
    const user = userEvent.setup();
    const gateway = createGateway(async () => ({
      ok: false,
      code: "PASSKEY_FAILED",
    }));
    renderEnrollment(gateway);
    await waitForProvider();

    await user.click(screen.getByRole("button", { name: "Set up passkey" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "The passkey could not be used. Try another sign-in method."
    );
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getAllByText(
      "The passkey could not be used. Try another sign-in method."
    )).toHaveLength(1);
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "The passkey could not be used. Try another sign-in method."
    );
  });

  it("lets the user continue without enrolling", async () => {
    const user = userEvent.setup();
    const registerPasskey = vi.fn(async () => success);
    renderEnrollment(createGateway(registerPasskey));
    await waitForProvider();

    await user.click(screen.getByRole("button", { name: "Maybe later" }));

    expect(registerPasskey).not.toHaveBeenCalled();
    expect(consumeFocusAfterAuth()).toBe(true);
    expect(navigation.replace).toHaveBeenCalledWith("/users");
  });

  it.each<PasskeyReadiness>([
    {
      status: "unsupported",
      message:
        "Passkeys are not supported in this browser. Use a password instead.",
    },
    {
      status: "misconfigured",
      message:
        "Passkeys are temporarily unavailable. Use a password instead.",
    },
  ])(
    "disables only setup when readiness is $status",
    async (readiness) => {
      browser.readiness = readiness;
      renderEnrollment(createGateway());
      await waitForProvider();

      expect(screen.getByText(readiness.message)).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Set up passkey" })
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "Maybe later" })).toBeEnabled();
    }
  );
});
