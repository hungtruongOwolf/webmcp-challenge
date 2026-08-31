import { describe, expect, it, vi } from "vitest";

import {
  authFailureMessage,
  createAuthGateway,
  type AuthFailureCode,
} from "@/app/libs/auth/auth-gateway";

const successAuthData = {
  user: { id: "user-id" },
  session: { access_token: "must-not-leak" },
};

const makeClient = () => ({
  auth: {
    signInWithPasskey: vi.fn().mockResolvedValue({
      data: successAuthData,
      error: null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { ...successAuthData, weakPassword: null },
      error: null,
    }),
    signUp: vi.fn().mockResolvedValue({
      data: successAuthData,
      error: null,
    }),
    signInWithOtp: vi.fn().mockResolvedValue({
      data: { user: null, session: null, messageId: "message-id" },
      error: null,
    }),
    registerPasskey: vi.fn().mockResolvedValue({
      data: {
        id: "new-passkey",
        friendly_name: "Laptop",
        created_at: "2026-08-30T18:00:00.000Z",
      },
      error: null,
    }),
    passkey: {
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
});

const gatewayFor = (client = makeClient()) =>
  createAuthGateway(client, "https://messenger.example");

describe("auth failure normalization", () => {
  it("maps a cancelled passkey prompt without exposing its raw message", async () => {
    const client = makeClient();
    client.auth.signInWithPasskey.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("raw browser cancellation"), {
        name: "NotAllowedError",
      }),
    });

    const result = await gatewayFor(client).signInWithPasskey();

    expect(result).toEqual({ ok: false, code: "PASSKEY_CANCELLED" });
    expect(JSON.stringify(result)).not.toContain("raw browser cancellation");
  });

  it("maps a missing WebAuthn credential", async () => {
    const client = makeClient();
    client.auth.signInWithPasskey.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("raw credential details"), {
        code: "webauthn_credential_not_found",
      }),
    });

    await expect(gatewayFor(client).signInWithPasskey()).resolves.toEqual({
      ok: false,
      code: "PASSKEY_NOT_FOUND",
    });
  });

  it("maps an unknown passkey registration error to a passkey failure", async () => {
    const client = makeClient();
    client.auth.registerPasskey.mockResolvedValueOnce({
      data: null,
      error: new Error("raw registration details"),
    });

    const result = await gatewayFor(client).registerPasskey();

    expect(result).toEqual({ ok: false, code: "PASSKEY_FAILED" });
    expect(JSON.stringify(result)).not.toContain("raw registration details");
  });

  it("maps invalid password credentials", async () => {
    const client = makeClient();
    client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null, weakPassword: null },
      error: Object.assign(new Error("raw password details"), {
        code: "invalid_credentials",
      }),
    });

    await expect(
      gatewayFor(client).signInWithPassword({
        email: "blind.user@example.org",
        password: "not-the-password",
      })
    ).resolves.toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  });

  it("maps email rate limiting before the email-link fallback", async () => {
    const client = makeClient();
    client.auth.signInWithOtp.mockResolvedValueOnce({
      data: { user: null, session: null, messageId: null },
      error: Object.assign(new Error("raw rate-limit details"), {
        code: "email_rate_limit_exceeded",
      }),
    });

    await expect(
      gatewayFor(client).sendEmailLink({
        email: "blind.user@example.org",
        returnPath: "/conversations",
        shouldCreateUser: false,
      })
    ).resolves.toEqual({ ok: false, code: "RATE_LIMITED" });
  });

  it("maps an unknown password error to fixed, non-sensitive UI copy", async () => {
    const client = makeClient();
    client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null, weakPassword: null },
      error: new Error("database host and request id must stay private"),
    });

    const result = await gatewayFor(client).signInWithPassword({
      email: "blind.user@example.org",
      password: "password",
    });

    expect(result).toEqual({ ok: false, code: "UNKNOWN" });
    expect(authFailureMessage("UNKNOWN")).toBe(
      "We could not complete authentication. Try again."
    );
    expect(JSON.stringify(result)).not.toContain("database host");
  });

  it("maps an unknown email-link error to its operation-specific failure", async () => {
    const client = makeClient();
    client.auth.signInWithOtp.mockResolvedValueOnce({
      data: { user: null, session: null, messageId: null },
      error: new Error("raw provider response"),
    });

    await expect(
      gatewayFor(client).sendEmailLink({
        email: "blind.user@example.org",
        returnPath: "/conversations",
        shouldCreateUser: false,
      })
    ).resolves.toEqual({ ok: false, code: "EMAIL_LINK_FAILED" });
  });
});

describe("email and password boundaries", () => {
  it("sends an email link with account metadata and a safe callback URL", async () => {
    const client = makeClient();

    const result = await gatewayFor(client).sendEmailLink({
      email: "blind.user@example.org",
      name: "Blind User",
      returnPath: "/conversations",
      shouldCreateUser: true,
    });

    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "blind.user@example.org",
      options: {
        shouldCreateUser: true,
        emailRedirectTo:
          "https://messenger.example/auth/callback?next=%2Fconversations&enroll=passkey",
        data: { name: "Blind User" },
      },
    });
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("signs up with name metadata and returns only session presence", async () => {
    const client = makeClient();

    const result = await gatewayFor(client).signUpWithPassword({
      name: "Blind User",
      email: "blind.user@example.org",
      password: "password",
      returnPath: "/users",
    });

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "blind.user@example.org",
      password: "password",
      options: {
        data: { name: "Blind User" },
        emailRedirectTo:
          "https://messenger.example/auth/callback?next=%2Fusers&enroll=passkey",
      },
    });
    expect(result).toEqual({ ok: true, value: { hasSession: true } });
    expect(JSON.stringify(result)).not.toContain("access_token");
  });

  it("signs in with a password without returning user or session data", async () => {
    const client = makeClient();

    const result = await gatewayFor(client).signInWithPassword({
      email: "blind.user@example.org",
      password: "password",
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(JSON.stringify(result)).not.toContain("user-id");
    expect(JSON.stringify(result)).not.toContain("access_token");
  });
});

describe("passkey boundaries", () => {
  it("returns only normalized passkey records when listing credentials", async () => {
    const client = makeClient();
    client.auth.passkey.list.mockResolvedValueOnce({
      data: [
        {
          id: "passkey-id",
          friendly_name: "Screen reader laptop",
          created_at: "2026-08-30T18:00:00.000Z",
          last_used_at: "2026-08-30T19:00:00.000Z",
          credential_secret: "must-not-leak",
        },
      ],
      error: null,
    });

    const result = await gatewayFor(client).listPasskeys();

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: "passkey-id",
          friendly_name: "Screen reader laptop",
          created_at: "2026-08-30T18:00:00.000Z",
          last_used_at: "2026-08-30T19:00:00.000Z",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("credential_secret");
  });

  it("registers and deletes passkeys without returning provider data", async () => {
    const client = makeClient();
    const gateway = gatewayFor(client);

    const registered = await gateway.registerPasskey();
    const deleted = await gateway.deletePasskey("passkey-id");

    expect(registered).toEqual({ ok: true, value: undefined });
    expect(deleted).toEqual({ ok: true, value: undefined });
    expect(client.auth.passkey.delete).toHaveBeenCalledWith({
      passkeyId: "passkey-id",
    });
    expect(JSON.stringify(registered)).not.toContain("new-passkey");
  });

  it("normalizes a passkey-list failure", async () => {
    const client = makeClient();
    client.auth.passkey.list.mockResolvedValueOnce({
      data: null,
      error: new Error("raw list details"),
    });

    await expect(gatewayFor(client).listPasskeys()).resolves.toEqual({
      ok: false,
      code: "UNKNOWN",
    });
  });
});

it.each<[AuthFailureCode, string]>([
  [
    "PASSKEY_CANCELLED",
    "Passkey sign-in cancelled. Choose another sign-in method when ready.",
  ],
  [
    "PASSKEY_NOT_FOUND",
    "No passkey was found for this device. Use an email link or password.",
  ],
  ["INVALID_CREDENTIALS", "The email or password was not recognized."],
  ["RATE_LIMITED", "Too many attempts. Wait a moment, then try again."],
  ["EMAIL_LINK_FAILED", "We could not send the sign-in link. Try again."],
  [
    "PASSKEY_FAILED",
    "The passkey could not be used. Try another sign-in method.",
  ],
  ["UNKNOWN", "We could not complete authentication. Try again."],
])("returns fixed UI copy for %s", (code, message) => {
  expect(authFailureMessage(code)).toBe(message);
});
