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
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
});

const gatewayFor = (client = makeClient()) =>
  createAuthGateway(client, "https://messenger.example");

type FakeClient = ReturnType<typeof makeClient>;
type Gateway = ReturnType<typeof gatewayFor>;

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

  it("maps rate limiting from a rejected password sign-in", async () => {
    const client = makeClient();
    client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null, weakPassword: null },
      error: Object.assign(new Error("raw rate-limit details"), {
        code: "over_email_send_rate_limit",
      }),
    });

    await expect(
      gatewayFor(client).signInWithPassword({
        email: "blind.user@example.org",
        password: "password",
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

});

describe("email and password boundaries", () => {
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

  it("signs out every session so a different person can sign in", async () => {
    const client = makeClient();

    await expect(gatewayFor(client).signOut()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
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

describe("rejected Supabase operations", () => {
  const cases: Array<{
    operation: string;
    reject: (client: FakeClient, error: Error) => void;
    invoke: (gateway: Gateway) => Promise<unknown>;
    code: AuthFailureCode;
  }> = [
    {
      operation: "passkey sign-in",
      reject: (client, error) =>
        client.auth.signInWithPasskey.mockRejectedValueOnce(error),
      invoke: (gateway) => gateway.signInWithPasskey(),
      code: "PASSKEY_FAILED",
    },
    {
      operation: "password sign-in",
      reject: (client, error) =>
        client.auth.signInWithPassword.mockRejectedValueOnce(error),
      invoke: (gateway) =>
        gateway.signInWithPassword({
          email: "blind.user@example.org",
          password: "password",
        }),
      code: "UNKNOWN",
    },
    {
      operation: "password sign-up",
      reject: (client, error) =>
        client.auth.signUp.mockRejectedValueOnce(error),
      invoke: (gateway) =>
        gateway.signUpWithPassword({
          name: "Blind User",
          email: "blind.user@example.org",
          password: "password",
          returnPath: "/conversations",
        }),
      code: "UNKNOWN",
    },
    {
      operation: "passkey registration",
      reject: (client, error) =>
        client.auth.registerPasskey.mockRejectedValueOnce(error),
      invoke: (gateway) => gateway.registerPasskey(),
      code: "PASSKEY_FAILED",
    },
    {
      operation: "passkey list",
      reject: (client, error) =>
        client.auth.passkey.list.mockRejectedValueOnce(error),
      invoke: (gateway) => gateway.listPasskeys(),
      code: "UNKNOWN",
    },
    {
      operation: "passkey deletion",
      reject: (client, error) =>
        client.auth.passkey.delete.mockRejectedValueOnce(error),
      invoke: (gateway) => gateway.deletePasskey("passkey-id"),
      code: "UNKNOWN",
    },
    {
      operation: "sign-out",
      reject: (client, error) => client.auth.signOut.mockRejectedValueOnce(error),
      invoke: (gateway) => gateway.signOut(),
      code: "UNKNOWN",
    },
  ];

  it.each(cases)(
    "normalizes and conceals a rejected $operation request",
    async ({ reject, invoke, code, operation }) => {
      const client = makeClient();
      const rawMessage = `raw ${operation} request details`;
      reject(client, new Error(rawMessage));

      const result = await invoke(gatewayFor(client));

      expect(result).toEqual({ ok: false, code });
      expect(JSON.stringify(result)).not.toContain(rawMessage);
    }
  );
});

it.each<[AuthFailureCode, string]>([
  [
    "PASSKEY_CANCELLED",
    "Passkey sign-in cancelled. Choose another sign-in method when ready.",
  ],
  [
    "PASSKEY_NOT_FOUND",
    "No passkey was found for this device. Use a password.",
  ],
  ["INVALID_CREDENTIALS", "The email or password was not recognized."],
  ["RATE_LIMITED", "Too many attempts. Wait a moment, then try again."],
  [
    "PASSKEY_FAILED",
    "The passkey could not be used. Try another sign-in method.",
  ],
  ["UNKNOWN", "We could not complete authentication. Try again."],
])("returns fixed UI copy for %s", (code, message) => {
  expect(authFailureMessage(code)).toBe(message);
});
