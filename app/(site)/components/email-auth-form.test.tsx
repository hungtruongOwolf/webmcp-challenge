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
  sendEmailLink: vi.fn(async () => success),
  registerPasskey: vi.fn(async () => success),
  listPasskeys: vi.fn(async () => ({ ok: true as const, value: [] })),
  deletePasskey: vi.fn(async () => success),
  ...overrides,
});

type RenderFormOptions = {
  variant?: "LOGIN" | "REGISTER";
  gateway?: AuthGateway;
  onAuthenticated?: () => void;
  onPasskeyEnrollment?: () => void;
};

const renderForm = ({
  variant = "LOGIN",
  gateway = createGateway(),
  onAuthenticated = vi.fn(),
  onPasskeyEnrollment = vi.fn(),
}: RenderFormOptions = {}) =>
  render(
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
      />
    </WebMCPConnectionProvider>
  );

const PendingPasskeyHarness = ({ gateway }: { gateway: AuthGateway }) => {
  const [isPending, setIsPending] = useState(false);

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

  it("keeps email-link before password submission in the control order", () => {
    renderForm();

    const controls = screen.getAllByRole("button");
    expect(controls.map((control) => control.textContent)).toEqual([
      "Email me a sign-in link",
      "Sign in with password",
    ]);
  });

  it("focuses its alert summary and marks email invalid after an empty email action", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(
      screen.getByRole("button", { name: "Email me a sign-in link" })
    );

    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("reports an empty password without erasing the entered email", async () => {
    const user = userEvent.setup();
    renderForm();
    const email = screen.getByLabelText("Email");

    await user.type(email, "reader@example.org");
    await user.click(
      screen.getByRole("button", { name: "Sign in with password" })
    );

    expect(screen.getByText("Password is required.")).toBeVisible();
    expect(email).toHaveValue("reader@example.org");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });

  it("requests a login link without creating a user and announces success", async () => {
    const user = userEvent.setup();
    const sendEmailLink = vi.fn(async () => success);
    renderForm({ gateway: createGateway({ sendEmailLink }) });

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.click(
      screen.getByRole("button", { name: "Email me a sign-in link" })
    );

    expect(sendEmailLink).toHaveBeenCalledWith({
      email: "reader@example.org",
      returnPath: "/users",
      shouldCreateUser: false,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sign-in link sent. Check your email."
    );
  });

  it("requires a name before requesting a registration link", async () => {
    const user = userEvent.setup();
    const sendEmailLink = vi.fn(async () => success);
    renderForm({
      variant: "REGISTER",
      gateway: createGateway({ sendEmailLink }),
    });

    await user.type(screen.getByLabelText("Email"), "new@example.org");
    await user.click(
      screen.getByRole("button", { name: "Email me a sign-in link" })
    );

    expect(screen.getByText("Name is required.")).toBeVisible();
    expect(sendEmailLink).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Name"), "Ada Reader");
    await user.click(
      screen.getByRole("button", { name: "Email me a sign-in link" })
    );

    expect(sendEmailLink).toHaveBeenCalledWith({
      email: "new@example.org",
      name: "Ada Reader",
      returnPath: "/users",
      shouldCreateUser: true,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Check your email to finish creating your account."
    );
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
    await user.click(
      screen.getByRole("button", { name: "Sign in with password" })
    );

    expect(screen.getByRole("status")).toHaveTextContent(
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
    await user.click(
      screen.getByRole("button", { name: "Create account with password" })
    );

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
    await user.click(
      screen.getByRole("button", { name: "Create account with password" })
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Check your email to finish creating your account."
    );
  });

  it("blocks email and password actions while the parent passkey request is pending", async () => {
    const user = userEvent.setup();
    const passkey = deferred<AuthResult>();
    const sendEmailLink = vi.fn(async () => success);
    const signInWithPassword = vi.fn(async () => success);
    const gateway = createGateway({
      signInWithPasskey: vi.fn(() => passkey.promise),
      sendEmailLink,
      signInWithPassword,
    });
    render(<PendingPasskeyHarness gateway={gateway} />);

    await user.type(screen.getByLabelText("Email"), "reader@example.org");
    await user.type(screen.getByLabelText("Password"), "secret phrase");
    await user.click(
      screen.getByRole("button", { name: "Start passkey request" })
    );
    await user.click(
      screen.getByRole("button", { name: "Email me a sign-in link" })
    );
    await user.click(
      screen.getByRole("button", { name: "Sign in with password" })
    );

    expect(sendEmailLink).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Sign in with password" })
    ).toBeDisabled();

    passkey.resolve(success);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Email me a sign-in link" })
      ).toBeEnabled()
    );
  });
});
