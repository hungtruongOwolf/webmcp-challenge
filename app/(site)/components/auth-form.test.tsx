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

    const passkeyButton = screen.getByRole("button", {
      name: "Sign in with a passkey",
    });

    expect(
      screen.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["Sign in with a passkey", "Sign in", "Create an account"]);
    expect(passkeyButton).toHaveAccessibleDescription(
      "Your operating system may offer a fingerprint, face, device PIN, password manager, or hardware security key."
    );
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
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("focuses a normalized alert after passkey sign-in fails", async () => {
    const user = userEvent.setup();
    boundary.gateway = createGateway({
      signInWithPasskey: vi.fn(async () => ({
        ok: false as const,
        code: "PASSKEY_FAILED" as const,
      })),
    });
    renderAuthForm();

    await user.click(
      screen.getByRole("button", { name: "Sign in with a passkey" })
    );

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

  it("clears a passkey failure when password authentication starts", async () => {
    const user = userEvent.setup();
    const password = deferred<AuthResult>();
    boundary.gateway = createGateway({
      signInWithPasskey: vi.fn(async () => ({
        ok: false as const,
        code: "PASSKEY_FAILED" as const,
      })),
      signInWithPassword: vi.fn(() => password.promise),
    });
    renderAuthForm();

    await user.click(
      screen.getByRole("button", { name: "Sign in with a passkey" })
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.type(screen.getByLabelText("Password"), "secret phrase");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Signing in…");

    password.resolve(success);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/users"));
  });

  it("clears a password failure when passkey authentication starts", async () => {
    const user = userEvent.setup();
    const passkey = deferred<AuthResult>();
    boundary.gateway = createGateway({
      signInWithPassword: vi.fn(async () => ({
        ok: false as const,
        code: "INVALID_CREDENTIALS" as const,
      })),
      signInWithPasskey: vi.fn(() => passkey.promise),
    });
    renderAuthForm();

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    const passkeyButton = screen.getByRole("button", {
      name: "Sign in with a passkey",
    });
    await user.click(passkeyButton);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Signing in…");

    passkey.resolve({ ok: false, code: "PASSKEY_CANCELLED" });
    await waitFor(() => expect(passkeyButton).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Passkey sign-in cancelled. Choose another sign-in method when ready."
    );
  });

  it("clears a password failure when switching account mode", async () => {
    const user = userEvent.setup();
    boundary.gateway = createGateway({
      signInWithPassword: vi.fn(async () => ({
        ok: false as const,
        code: "INVALID_CREDENTIALS" as const,
      })),
    });
    renderAuthForm();

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    await user.click(
      screen.getByRole("button", { name: "Create an account" })
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });

  it("omits passkey action and explains when passkeys are unavailable", () => {
    browser.readiness = {
      status: "unsupported",
      message: "Passkeys are not supported in this browser. Use a password instead.",
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

  it("focuses callback recovery and links to try creating the account again", async () => {
    renderAuthForm("/users", "auth_link_invalid");

    const callbackAlert = screen.getByRole("alert");
    expect(callbackAlert).toHaveTextContent(
      "That confirmation link is invalid or expired."
    );
    expect(
      screen.getByRole("link", { name: "Try creating your account again" })
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

  it("blocks passkey and variant actions while a password request is pending", async () => {
    const user = userEvent.setup();
    const password = deferred<AuthResult>();
    const signInWithPasskey = vi.fn(async () => success);
    boundary.gateway = createGateway({
      signInWithPassword: vi.fn(() => password.promise),
      signInWithPasskey,
    });
    renderAuthForm();

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.type(screen.getByLabelText("Password"), "secret phrase");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
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

    password.resolve(success);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/users"));
  });
});
