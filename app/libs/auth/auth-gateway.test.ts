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
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
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
    signOut: vi.fn().mockResolvedValue({ error: null }),
    passkey: {
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
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

  it("maps signing up with an email that already has an account", async () => {
    const client = makeClient();
    client.auth.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: Object.assign(new Error("raw provider detail"), {
        code: "user_already_exists",
      }),
    });

    const result = await gatewayFor(client).signUpWithPassword({
      name: "Blind User",
      email: "blind.user@example.org",
      password: "password",
      returnPath: "/users",
    });

    expect(result).toEqual({ ok: false, code: "ACCOUNT_EXISTS" });
    expect(JSON.stringify(result)).not.toContain("raw provider detail");
  });

  it("maps a weak password rejected at sign-up", async () => {
    const client = makeClient();
    client.auth.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: Object.assign(new Error("Password should be at least 6 characters."), {
        code: "weak_password",
      }),
    });

    const result = await gatewayFor(client).signUpWithPassword({
      name: "Blind User",
      email: "blind.user@example.org",
      password: "123",
      returnPath: "/users",
    });

    expect(result).toEqual({ ok: false, code: "WEAK_PASSWORD" });
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

  it("signs up with a passkey using a generated password never returned to the caller", async () => {
    const client = makeClient();

    const result = await gatewayFor(client).signUpWithPasskey({
      name: "Blind User",
      email: "blind.user@example.org",
      returnPath: "/users",
    });

    expect(client.auth.signUp).toHaveBeenCalledTimes(1);
    const call = client.auth.signUp.mock.calls[0][0];
    expect(call.email).toBe("blind.user@example.org");
    expect(call.options).toEqual({
      data: { name: "Blind User" },
      emailRedirectTo:
        "https://messenger.example/auth/callback?next=%2Fusers&enroll=passkey",
    });
    expect(typeof call.password).toBe("string");
    expect(call.password.length).toBeGreaterThanOrEqual(32);

    expect(result).toEqual({ ok: true, value: { hasSession: true } });
    expect(JSON.stringify(result)).not.toContain(call.password);
    expect(JSON.stringify(result)).not.toContain("access_token");
  });

  it("registers the passkey immediately as part of a successful passkey signup", async () => {
    const client = makeClient();

    const result = await gatewayFor(client).signUpWithPasskey({
      name: "Blind User",
      email: "blind.user@example.org",
      returnPath: "/users",
    });

    expect(client.auth.registerPasskey).toHaveBeenCalledTimes(1);
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, value: { hasSession: true } });
  });

  it("deletes the bootstrap account and signs out when the passkey ceremony is cancelled", async () => {
    const client = makeClient();
    client.auth.registerPasskey.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("cancelled"), { name: "NotAllowedError" }),
    });

    const result = await gatewayFor(client).signUpWithPasskey({
      name: "Blind User",
      email: "blind.user@example.org",
      returnPath: "/users",
    });

    // The RPC (server-side delete of the just-created auth.users row) must
    // run before sign-out -- it needs the still-active session to know
    // which account to delete.
    const rpcOrder = client.rpc.mock.invocationCallOrder[0];
    const signOutOrder = client.auth.signOut.mock.invocationCallOrder[0];
    expect(client.rpc).toHaveBeenCalledWith("delete_unenrolled_passkey_signup");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(rpcOrder).toBeLessThan(signOutOrder);
    expect(result).toEqual({ ok: false, code: "PASSKEY_CANCELLED" });
  });

  it("still rolls back (both steps attempted) even if the cleanup RPC itself fails", async () => {
    const client = makeClient();
    client.auth.registerPasskey.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("cancelled"), { name: "NotAllowedError" }),
    });
    client.rpc.mockRejectedValueOnce(new Error("network down"));

    await expect(
      gatewayFor(client).signUpWithPasskey({
        name: "Blind User",
        email: "blind.user@example.org",
        returnPath: "/users",
      })
    ).resolves.toEqual({ ok: false, code: "PASSKEY_CANCELLED" });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("still rolls back even if the sign-out call itself fails", async () => {
    const client = makeClient();
    client.auth.registerPasskey.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("cancelled"), { name: "NotAllowedError" }),
    });
    client.auth.signOut.mockRejectedValueOnce(new Error("network down"));

    await expect(
      gatewayFor(client).signUpWithPasskey({
        name: "Blind User",
        email: "blind.user@example.org",
        returnPath: "/users",
      })
    ).resolves.toEqual({ ok: false, code: "PASSKEY_CANCELLED" });
    expect(client.rpc).toHaveBeenCalledWith("delete_unenrolled_passkey_signup");
  });

  it("does not attempt to register a passkey when signup left no session", async () => {
    const client = makeClient();
    client.auth.signUp.mockResolvedValueOnce({
      data: { user: { id: "user-id" }, session: null },
      error: null,
    });

    const result = await gatewayFor(client).signUpWithPasskey({
      name: "Blind User",
      email: "blind.user@example.org",
      returnPath: "/users",
    });

    expect(client.auth.registerPasskey).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, value: { hasSession: false } });
  });

  it("generates a different bootstrap password on every passkey signup call", async () => {
    const client = makeClient();
    const gateway = gatewayFor(client);

    await gateway.signUpWithPasskey({
      name: "A",
      email: "a@example.org",
      returnPath: "/users",
    });
    await gateway.signUpWithPasskey({
      name: "B",
      email: "b@example.org",
      returnPath: "/users",
    });

    const [firstCall, secondCall] = client.auth.signUp.mock.calls;
    expect(firstCall[0].password).not.toBe(secondCall[0].password);
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
  [
    "ACCOUNT_EXISTS",
    "An account already exists for this email. Sign in instead.",
  ],
  ["WEAK_PASSWORD", "Password should be at least 6 characters."],
  ["RATE_LIMITED", "Too many attempts. Wait a moment, then try again."],
  [
    "PASSKEY_FAILED",
    "The passkey could not be used. Try another sign-in method.",
  ],
  ["UNKNOWN", "We could not complete authentication. Try again."],
])("returns fixed UI copy for %s", (code, message) => {
  expect(authFailureMessage(code)).toBe(message);
});
