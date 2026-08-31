import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthGateway, AuthResult } from "@/app/libs/auth/auth-gateway";
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
  sendEmailLink: async () => success,
  registerPasskey,
  listPasskeys: async () => ({ ok: true, value: [] }),
  deletePasskey: async () => success,
});

const renderEnrollment = (gateway: AuthGateway, returnPath = "/users") =>
  render(
    <WebMCPConnectionProvider modelContext={null} currentUserId="user-a">
      <ConnectionStatusIndicator />
      <PasskeyEnrollment returnPath={returnPath} gateway={gateway} />
    </WebMCPConnectionProvider>
  );

const waitForProvider = () =>
  waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Signed in. Messenger is ready; agent tools are unavailable in this browser."
    )
  );

describe("PasskeyEnrollment", () => {
  beforeEach(() => {
    navigation.replace.mockReset();
    browser.readiness = {
      status: "ready",
      message: "Passkeys are available.",
    };
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

  it("announces success and replaces with a sanitized destination", async () => {
    const user = userEvent.setup();
    renderEnrollment(createGateway(), "https://attacker.example/private");
    await waitForProvider();

    await user.click(screen.getByRole("button", { name: "Set up passkey" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Passkey saved. Next time, one action."
    );
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
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("lets the user continue without enrolling", async () => {
    const user = userEvent.setup();
    const registerPasskey = vi.fn(async () => success);
    renderEnrollment(createGateway(registerPasskey));
    await waitForProvider();

    await user.click(screen.getByRole("button", { name: "Maybe later" }));

    expect(registerPasskey).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith("/users");
  });

  it.each<PasskeyReadiness>([
    {
      status: "unsupported",
      message:
        "Passkeys are not supported in this browser. Use an email link or password.",
    },
    {
      status: "misconfigured",
      message:
        "Passkeys are temporarily unavailable. Use an email link or password.",
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
