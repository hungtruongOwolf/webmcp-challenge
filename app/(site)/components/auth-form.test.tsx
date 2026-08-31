import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthGateway, AuthResult } from "@/app/libs/auth/auth-gateway";
import type { PasskeyReadiness } from "@/app/libs/auth/passkey-readiness";
import { consumeFocusAfterAuth } from "@/app/libs/auth/focus-after-auth";
import { WebMCPConnectionProvider } from "@/app/webmcp/connection-provider";
import { ConnectionStatusIndicator } from "@/app/webmcp/connection-status-indicator";

import AuthForm from "./auth-form";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  replace: vi.fn(),
  refresh: vi.fn(),
}));

const browser = vi.hoisted(() => ({
  readiness: {
    status: "ready",
    message: "Passkeys are available.",
  } as PasskeyReadiness,
}));

const session = vi.hoisted(() => ({
  currentUser: null as { id: string } | null,
}));

const boundary = vi.hoisted(() => ({
  gateway: null as AuthGateway | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    replace: navigation.replace,
    refresh: navigation.refresh,
  }),
}));

vi.mock("@/app/hooks/use-passkey-readiness", () => ({
  usePasskeyReadiness: () => browser.readiness,
}));

vi.mock("@/app/context/current-user-context", () => ({
  useCurrentUser: () => session.currentUser,
}));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPasskey: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      registerPasskey: vi.fn(),
    },
  }),
}));

vi.mock("@/app/libs/auth/auth-gateway", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/app/libs/auth/auth-gateway")
  >();
  return {
    ...actual,
    createAuthGateway: () => boundary.gateway,
  };
});

const success: AuthResult = { ok: true, value: undefined };

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const createGateway = (overrides: Partial<AuthGateway> = {}): AuthGateway => ({
  signInWithPasskey: vi.fn(async () => success),
  signInWithPassword: vi.fn(async () => success),
  signUpWithPassword: vi.fn(async () => ({
    ok: true as const,
    value: { hasSession: true },
  })),
  sendEmailLink: vi.fn(async () => success),
  registerPasskey: vi.fn(async () => success),
  listPasskeys: vi.fn(async () => ({ ok: true as const, value: [] })),
  deletePasskey: vi.fn(async () => success),
  ...overrides,
});

const authFormTree = (
  returnPath = "/users",
  callbackError?: "auth_link_invalid"
) => (
    <WebMCPConnectionProvider modelContext={null} currentUserId={null}>
      <ConnectionStatusIndicator />
      <AuthForm returnPath={returnPath} callbackError={callbackError} />
    </WebMCPConnectionProvider>
  );

const renderAuthForm = (
  returnPath = "/users",
  callbackError?: "auth_link_invalid"
) => render(authFormTree(returnPath, callbackError));

describe("AuthForm", () => {
  beforeEach(() => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    browser.readiness = {
      status: "ready",
      message: "Passkeys are available.",
    };
    session.currentUser = null;
    boundary.gateway = createGateway();
    sessionStorage.clear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it("puts passkey sign-in first without prompting on mount", () => {
    renderAuthForm();

    expect(
      screen.getAllByRole("button").map((button) => button.textContent)
    ).toEqual([
      "Sign in with a passkey",
      "Email me a sign-in link",
      "Sign in with password",
      "Create an account",
    ]);
    expect(boundary.gateway?.signInWithPasskey).not.toHaveBeenCalled();
  });

  it("marks destination focus and replaces with the sanitized path after passkey success", async () => {
    const user = userEvent.setup();
    renderAuthForm("https://attacker.example/private");

    await user.click(
      screen.getByRole("button", { name: "Sign in with a passkey" })
    );

    expect(consumeFocusAfterAuth()).toBe(true);
    expect(navigation.replace).toHaveBeenCalledWith("/conversations");
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("treats passkey cancellation as recoverable, restores focus, and announces it", async () => {
    const user = userEvent.setup();
    boundary.gateway = createGateway({
      signInWithPasskey: vi.fn(async () => ({
        ok: false as const,
        code: "PASSKEY_CANCELLED" as const,
      })),
    });
    renderAuthForm();
    const passkey = screen.getByRole("button", {
      name: "Sign in with a passkey",
    });

    await user.click(passkey);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Passkey sign-in cancelled. Choose another sign-in method when ready."
    );
    await waitFor(() => expect(passkey).toHaveFocus());
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("omits passkey action and explains when passkeys are unavailable", () => {
    browser.readiness = {
      status: "unsupported",
      message:
        "Passkeys are not supported in this browser. Use an email link or password.",
    };
    renderAuthForm();

    expect(
      screen.queryByRole("button", { name: "Sign in with a passkey" })
    ).not.toBeInTheDocument();
    expect(screen.getByText(browser.readiness.message)).toBeVisible();
  });

  it("renders only a heading and noninteractive status while readiness is checking", () => {
    browser.readiness = {
      status: "checking",
      message: "Checking passkey support…",
    };
    renderAuthForm();

    expect(screen.getByRole("heading", { name: "Sign in options" })).toBeVisible();
    expect(screen.getByText("Checking passkey support…")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("focuses callback recovery and links to a new email-link request", async () => {
    renderAuthForm("/users", "auth_link_invalid");

    const callbackAlert = screen.getByRole("alert");
    expect(callbackAlert).toHaveTextContent(
      "That sign-in link is invalid or expired."
    );
    expect(
      screen.getByRole("link", { name: "Email me a new link" })
    ).toHaveAttribute("href", "#email");
    await waitFor(() => expect(callbackAlert).toHaveFocus());
  });

  it("focuses callback recovery after the readiness check completes", async () => {
    browser.readiness = {
      status: "checking",
      message: "Checking passkey support…",
    };
    const view = renderAuthForm("/users", "auth_link_invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    browser.readiness = {
      status: "ready",
      message: "Passkeys are available.",
    };
    view.rerender(authFormTree("/users", "auth_link_invalid"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });

  it("uses the exact password autocomplete purpose for each variant", async () => {
    const user = userEvent.setup();
    renderAuthForm();

    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password"
    );

    await user.click(
      screen.getByRole("button", { name: "Create an account" })
    );

    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });

  it("replaces with the sanitized return path when a session already exists", async () => {
    session.currentUser = { id: "signed-in-user" };
    renderAuthForm("//attacker.example/private");

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/conversations")
    );
    expect(navigation.replace).not.toHaveBeenCalledWith("/users");
  });

  it("blocks passkey and variant actions while an email-link request is pending", async () => {
    const user = userEvent.setup();
    const emailLink = deferred<AuthResult>();
    const signInWithPasskey = vi.fn(async () => success);
    boundary.gateway = createGateway({
      sendEmailLink: vi.fn(() => emailLink.promise),
      signInWithPasskey,
    });
    renderAuthForm();

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.click(
      screen.getByRole("button", { name: "Email me a sign-in link" })
    );
    await user.click(
      screen.getByRole("button", { name: "Sign in with a passkey" })
    );
    await user.click(
      screen.getByRole("button", { name: "Create an account" })
    );

    expect(signInWithPasskey).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
    expect(
      screen.getByRole("button", { name: "Sign in with a passkey" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create an account" })
    ).toBeDisabled();

    emailLink.resolve(success);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Sign-in link sent. Check your email."
      )
    );
  });
});
