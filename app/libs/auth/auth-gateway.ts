import { buildAuthCallbackUrl } from "@/app/libs/auth/return-path";
import { createClient } from "@/app/libs/supabase/client";

export type AuthFailureCode =
  | "PASSKEY_CANCELLED"
  | "PASSKEY_NOT_FOUND"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "PASSKEY_FAILED"
  | "ACCOUNT_EXISTS"
  | "WEAK_PASSWORD"
  | "UNKNOWN";

export type AuthResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; code: AuthFailureCode };

export type PasskeyRecord = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

export type AuthGateway = {
  signInWithPasskey(): Promise<AuthResult>;
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<AuthResult>;
  signUpWithPassword(input: {
    name: string;
    email: string;
    password: string;
    returnPath: string;
  }): Promise<AuthResult<{ hasSession: boolean }>>;
  signUpWithPasskey(input: {
    name: string;
    email: string;
    returnPath: string;
  }): Promise<AuthResult<{ hasSession: boolean }>>;
  registerPasskey(): Promise<AuthResult>;
  listPasskeys(): Promise<AuthResult<PasskeyRecord[]>>;
  deletePasskey(passkeyId: string): Promise<AuthResult>;
};

type SupabaseResponse<T> =
  | { data: T; error: null }
  | { data: unknown; error: unknown };

type AuthClient = {
  // Supabase's real client returns a thenable query builder here, not a
  // plain Promise -- PromiseLike is the loosest shape that's still
  // awaitable and matches both that and a simple mock.
  rpc(fn: string): PromiseLike<unknown>;
  auth: {
    signInWithPasskey(): Promise<SupabaseResponse<unknown>>;
    signInWithPassword(input: {
      email: string;
      password: string;
    }): Promise<SupabaseResponse<unknown>>;
    signUp(input: {
      email: string;
      password: string;
      options: {
        data: { name: string; [key: string]: unknown };
        emailRedirectTo: string;
      };
    }): Promise<SupabaseResponse<{ session: unknown }>>;
    registerPasskey(): Promise<SupabaseResponse<unknown>>;
    signOut(options?: { scope?: "local" | "global" | "others" }): Promise<{
      error: unknown;
    }>;
    passkey: {
      list(): Promise<SupabaseResponse<unknown>>;
      delete(input: {
        passkeyId: string;
      }): Promise<SupabaseResponse<unknown>>;
    };
  };
};

type FailureContext = "passkey" | "default";

type SignUpWithPasswordInput = Parameters<
  AuthGateway["signUpWithPassword"]
>[0];

const getErrorProperty = (error: unknown, property: "name" | "code") => {
  if ((typeof error !== "object" || error === null) && typeof error !== "function") {
    return undefined;
  }

  const value = Reflect.get(error, property);
  return typeof value === "string" ? value : undefined;
};

const normalizeAuthFailure = (
  error: unknown,
  context: FailureContext = "default"
): AuthResult<never> => {
  const name = getErrorProperty(error, "name");
  const code = getErrorProperty(error, "code");

  if (name === "NotAllowedError" || name === "AbortError") {
    return { ok: false, code: "PASSKEY_CANCELLED" };
  }
  if (code === "webauthn_credential_not_found") {
    return { ok: false, code: "PASSKEY_NOT_FOUND" };
  }
  if (code === "invalid_credentials") {
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  if (code === "user_already_exists") {
    return { ok: false, code: "ACCOUNT_EXISTS" };
  }
  if (code === "weak_password") {
    return { ok: false, code: "WEAK_PASSWORD" };
  }
  if (code?.includes("rate_limit")) {
    return { ok: false, code: "RATE_LIMITED" };
  }
  if (context === "passkey") {
    return { ok: false, code: "PASSKEY_FAILED" };
  }
  return { ok: false, code: "UNKNOWN" };
};

const resolveAppOrigin = (): string => {
  if (process.env.NEXT_PUBLIC_APP_ORIGIN) {
    return process.env.NEXT_PUBLIC_APP_ORIGIN;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  throw new Error("App origin is unavailable.");
};

/**
 * Bootstraps a session for passkey-only signup. registerPasskey() hard-
 * requires an existing session (Supabase's WebAuthn beta has no
 * signUpWithPasskey -- verified against the @supabase/auth-js source, and
 * this project has anonymous sign-ins disabled -- verified live against the
 * Auth API), so signUpWithPasskey still calls the same password signUp
 * underneath. The password is generated here, used once, and never stored,
 * logged, or shown -- the user only ever authenticates with the passkey
 * enrolled right after.
 */
const generateBootstrapPassword = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
};

const toPasskeyRecord = (value: unknown): PasskeyRecord | undefined => {
  if (typeof value !== "object" || value === null) return undefined;

  const id = Reflect.get(value, "id");
  const createdAt = Reflect.get(value, "created_at");
  const friendlyName = Reflect.get(value, "friendly_name");
  const lastUsedAt = Reflect.get(value, "last_used_at");

  if (typeof id !== "string" || typeof createdAt !== "string") {
    return undefined;
  }

  return {
    id,
    created_at: createdAt,
    ...(typeof friendlyName === "string"
      ? { friendly_name: friendlyName }
      : {}),
    ...(typeof lastUsedAt === "string" ? { last_used_at: lastUsedAt } : {}),
  };
};

export const createAuthGateway = (
  client: AuthClient = createClient(),
  appOrigin: string = resolveAppOrigin()
): AuthGateway => {
  const performSignUp = async (
    email: string,
    password: string,
    name: string,
    returnPath: string,
    extraMetadata?: Record<string, unknown>
  ): Promise<AuthResult<{ hasSession: boolean }>> => {
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { name, ...extraMetadata },
          emailRedirectTo: buildAuthCallbackUrl(appOrigin, returnPath, true),
        },
      });
      return error
        ? normalizeAuthFailure(error)
        : {
            ok: true,
            value: {
              hasSession: Boolean(
                typeof data === "object" && data !== null
                  ? Reflect.get(data, "session")
                  : undefined
              ),
            },
          };
    } catch (error) {
      return normalizeAuthFailure(error);
    }
  };

  const signUpWithPassword = ({
    email,
    password,
    name,
    returnPath,
  }: SignUpWithPasswordInput): Promise<AuthResult<{ hasSession: boolean }>> =>
    performSignUp(email, password, name, returnPath);

  const signInWithPasskey = async (): Promise<AuthResult> => {
    try {
      const { error } = await client.auth.signInWithPasskey();
      return error
        ? normalizeAuthFailure(error, "passkey")
        : { ok: true, value: undefined };
    } catch (error) {
      return normalizeAuthFailure(error, "passkey");
    }
  };

  const signInWithPassword: AuthGateway["signInWithPassword"] = async (
    input
  ) => {
    try {
      const { error } = await client.auth.signInWithPassword(input);
      return error
        ? normalizeAuthFailure(error)
        : { ok: true, value: undefined };
    } catch (error) {
      return normalizeAuthFailure(error);
    }
  };

  const registerPasskey = async (): Promise<AuthResult> => {
    try {
      const { error } = await client.auth.registerPasskey();
      return error
        ? normalizeAuthFailure(error, "passkey")
        : { ok: true, value: undefined };
    } catch (error) {
      return normalizeAuthFailure(error, "passkey");
    }
  };

  const signUpWithPasskey: AuthGateway["signUpWithPasskey"] = async ({
    email,
    name,
    returnPath,
  }) => {
    const signUpResult = await performSignUp(
      email,
      generateBootstrapPassword(),
      name,
      returnPath,
      // Marks this row as a passkey bootstrap still pending enrollment, so
      // the server-side sweep (cleanup_abandoned_passkey_signups(), for
      // when the user closes the tab or loses network mid-ceremony instead
      // of hitting the client-side rollback below) can tell it apart from
      // a real password-signup account that just hasn't done anything yet
      // -- those never carry this flag and are never eligible.
      { passkey_bootstrap: true }
    );
    if (!signUpResult.ok || !signUpResult.value.hasSession) {
      return signUpResult;
    }

    // The whole point of this path is a passkey -- a session bootstrapped
    // with a random password nobody knows, but with no passkey enrolled,
    // is a dead end the user can never sign back into. If the ceremony
    // fails or is cancelled, roll back completely rather than leave them
    // stranded in that half-created state.
    const passkeyResult = await registerPasskey();
    if (passkeyResult.ok) return signUpResult;

    // Signing out alone only drops the local session -- the auth.users row
    // itself would still exist, permanently blocking this email with
    // user_already_exists on the next attempt. delete_unenrolled_passkey_
    // signup() (a narrowly-scoped RPC, since the anon client has no
    // self-delete and the service-role key isn't available here) removes
    // the row itself while the session can still identify it -- must run
    // before sign-out, not after.
    try {
      await client.rpc("delete_unenrolled_passkey_signup");
    } catch {
      // Best-effort: surfacing the real passkey failure below matters more
      // than a cleanup call that couldn't complete.
    }
    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      // Same reasoning.
    }
    return passkeyResult;
  };

  const listPasskeys = async (): Promise<AuthResult<PasskeyRecord[]>> => {
    try {
      const { data, error } = await client.auth.passkey.list();
      if (error) return normalizeAuthFailure(error);
      if (!Array.isArray(data)) return normalizeAuthFailure(undefined);

      const passkeys = data.map(toPasskeyRecord);
      if (passkeys.some((passkey) => !passkey)) {
        return normalizeAuthFailure(undefined);
      }
      return { ok: true, value: passkeys as PasskeyRecord[] };
    } catch (error) {
      return normalizeAuthFailure(error);
    }
  };

  const deletePasskey = async (passkeyId: string): Promise<AuthResult> => {
    try {
      const { error } = await client.auth.passkey.delete({ passkeyId });
      return error
        ? normalizeAuthFailure(error)
        : { ok: true, value: undefined };
    } catch (error) {
      return normalizeAuthFailure(error);
    }
  };

  return {
    signInWithPasskey,
    signInWithPassword,
    signUpWithPassword,
    signUpWithPasskey,
    registerPasskey,
    listPasskeys,
    deletePasskey,
  };
};

const AUTH_FAILURE_MESSAGES: Record<AuthFailureCode, string> = {
  PASSKEY_CANCELLED:
    "Passkey sign-in cancelled. Choose another sign-in method when ready.",
  PASSKEY_NOT_FOUND: "No passkey was found for this device. Use a password.",
  INVALID_CREDENTIALS: "The email or password was not recognized.",
  ACCOUNT_EXISTS:
    "An account already exists for this email. Sign in instead.",
  WEAK_PASSWORD: "Password should be at least 6 characters.",
  RATE_LIMITED: "Too many attempts. Wait a moment, then try again.",
  PASSKEY_FAILED:
    "The passkey could not be used. Try another sign-in method.",
  UNKNOWN: "We could not complete authentication. Try again.",
};

export const authFailureMessage = (code: AuthFailureCode): string =>
  AUTH_FAILURE_MESSAGES[code];
