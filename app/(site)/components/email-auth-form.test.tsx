import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthGateway, AuthResult } from "@/app/libs/auth/auth-gateway";
import { WebMCPConnectionProvider } from "@/app/webmcp/connection-provider";
import { ConnectionStatusIndicator } from "@/app/webmcp/connection-status-indicator";

import { EmailAuthForm } from "./email-auth-form";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

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
  signOut: vi.fn(async () => success),
  ...overrides,
});

type RenderFormOptions = {
  variant?: "LOGIN" | "REGISTER";
  gateway?: AuthGateway;
  onAuthenticated?: () => void;
  onPasskeyEnrollment?: () => void;
};

const EmailAuthFormHarness = ({
  variant = "LOGIN",
  gateway = createGateway(),
  onAuthenticated = vi.fn(),
  onPasskeyEnrollment = vi.fn(),
}: RenderFormOptions) => {
  const [operationError, setOperationError] = useState<string | null>(null);

  return (
    <WebMCPConnectionProvider modelContext={null} currentUserId={null}>
      <ConnectionStatusIndicator />
      <EmailAuthForm
        variant={variant}
        returnPath="/users"
        gateway={gateway}
        onAuthenticated={onAuthenticated}
        onPasskeyEnrollment={onPasskeyEnrollment}
        isPending={false}
        onSubmissionStart={() => true}
        onSubmissionEnd={() => undefined}
        operationError={operationError}
        onOperationError={setOperationError}
      />
    </WebMCPConnectionProvider>
  );
};

const renderForm = ({
  variant = "LOGIN",
  gateway = createGateway(),
  onAuthenticated = vi.fn(),
  onPasskeyEnrollment = vi.fn(),
}: RenderFormOptions = {}) =>
  render(
    <EmailAuthFormHarness
      variant={variant}
      gateway={gateway}
      onAuthenticated={onAuthenticated}
      onPasskeyEnrollment={onPasskeyEnrollment}
    />
  );

const PendingPasskeyHarness = ({ gateway }: { gateway: AuthGateway }) => {
  const [isPending, setIsPending] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  const startSubmission = () => {
    if (isPending) return false;
    setIsPending(true);
    return true;
  };

  const endSubmission = () => setIsPending(false);

  const startPasskey = async () => {
    if (!startSubmission()) return;
    await gateway.signInWithPasskey();
    endSubmission();
  };

  return (
    <WebMCPConnectionProvider modelContext={null} currentUserId={null}>
      <ConnectionStatusIndicator />
      <button type="button" onClick={startPasskey} disabled={isPending}>
        Start passkey request
      </button>
      <EmailAuthForm
        variant="LOGIN"
        returnPath="/users"
        gateway={gateway}
        onAuthenticated={() => undefined}
        onPasskeyEnrollment={() => undefined}
        isPending={isPending}
        onSubmissionStart={startSubmission}
        onSubmissionEnd={endSubmission}
        operationError={operationError}
        onOperationError={setOperationError}
      />
    </WebMCPConnectionProvider>
  );
};

describe("EmailAuthForm", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it("shows the email and password fields directly, no other sign-in method", () => {
    renderForm();

    expect(screen.getByLabelText("Email")).toBeVisible();
    expect(screen.getByLabelText("Password")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sign in" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /email me a sign-in link/i })
    ).not.toBeInTheDocument();
  });

  it("shows a Name field only for the REGISTER variant", () => {
    renderForm({ variant: "REGISTER" });

    expect(screen.getByLabelText("Name")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create account" })
    ).toBeVisible();
  });

  it("reports an empty password without erasing the entered email", async () => {
    const user = userEvent.setup();
    renderForm();
    const email = screen.getByLabelText("Email");

    await user.type(email, "reader@example.org");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Password is required.")).toBeVisible();
    expect(email).toHaveValue("reader@example.org");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });

  it("signs in with a password and calls onAuthenticated", async () => {
    const user = userEvent.setup();
    const signInWithPassword = vi.fn(async () => success);
    const onAuthenticated = vi.fn();
    renderForm({ gateway: createGateway({ signInWithPassword }), onAuthenticated });

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.type(screen.getByLabelText("Password"), "the password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "reader@example.org",
      password: "the password",
    });
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());
  });

  it("announces the fixed invalid-credentials message instead of provider text", async () => {
    const user = userEvent.setup();
    const signInWithPassword = vi.fn(async () => ({
      ok: false as const,
      code: "INVALID_CREDENTIALS" as const,
      providerMessage: "raw provider detail",
    }));
    renderForm({ gateway: createGateway({ signInWithPassword }) });

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The email or password was not recognized."
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(screen.getAllByText(
      "The email or password was not recognized."
    )).toHaveLength(1);
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "The email or password was not recognized."
    );
    expect(screen.queryByText("raw provider detail")).not.toBeInTheDocument();
  });

  it("offers passkey enrollment after registration with a session", async () => {
    const user = userEvent.setup();
    const onPasskeyEnrollment = vi.fn();
    renderForm({ variant: "REGISTER", onPasskeyEnrollment });

    await user.type(screen.getByLabelText("Name"), "Ada Reader");
    await user.type(screen.getByLabelText("Email"), "new@example.org");
    await user.type(screen.getByLabelText("Password"), "strong password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(onPasskeyEnrollment).toHaveBeenCalledOnce();
  });

  it("announces email confirmation after registration without a session", async () => {
    const user = userEvent.setup();
    const signUpWithPassword = vi.fn(async () => ({
      ok: true as const,
      value: { hasSession: false },
    }));
    renderForm({
      variant: "REGISTER",
      gateway: createGateway({ signUpWithPassword }),
    });

    await user.type(screen.getByLabelText("Name"), "Ada Reader");
    await user.type(screen.getByLabelText("Email"), "new@example.org");
    await user.type(screen.getByLabelText("Password"), "strong password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Check your email to finish creating your account."
    );
  });

  it("blocks the password action while the parent passkey request is pending", async () => {
    const user = userEvent.setup();
    const passkey = deferred<AuthResult>();
    const signInWithPassword = vi.fn(async () => success);
    const gateway = createGateway({
      signInWithPasskey: vi.fn(() => passkey.promise),
      signInWithPassword,
    });
    render(<PendingPasskeyHarness gateway={gateway} />);

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.type(screen.getByLabelText("Password"), "secret phrase");
    await user.click(
      screen.getByRole("button", { name: "Start passkey request" })
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();

    passkey.resolve(success);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled()
    );
  });
});
