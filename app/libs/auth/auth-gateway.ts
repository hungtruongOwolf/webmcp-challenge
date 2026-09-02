import { buildAuthCallbackUrl } from "@/app/libs/auth/return-path";
import { createClient } from "@/app/libs/supabase/client";

export type AuthFailureCode =
  | "PASSKEY_CANCELLED"
  | "PASSKEY_NOT_FOUND"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "PASSKEY_FAILED"
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
  registerPasskey(): Promise<AuthResult>;
  listPasskeys(): Promise<AuthResult<PasskeyRecord[]>>;
  deletePasskey(passkeyId: string): Promise<AuthResult>;
  /** "global" ends every session (the account-switch button); "local" only this browser. */
  signOut(scope?: SignOutScope): Promise<AuthResult>;
};

export type SignOutScope = "global" | "local";

type SupabaseResponse<T> =
  | { data: T; error: null }
  | { data: unknown; error: unknown };

type AuthClient = {
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
        data: { name: string };
        emailRedirectTo: string;
      };
    }): Promise<SupabaseResponse<{ session: unknown }>>;
    registerPasskey(): Promise<SupabaseResponse<unknown>>;
    passkey: {
      list(): Promise<SupabaseResponse<unknown>>;
      delete(input: {
        passkeyId: string;
      }): Promise<SupabaseResponse<unknown>>;
    };
    signOut(input: { scope: SignOutScope }): Promise<{ error: unknown }>;
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
  const signUpWithPassword = async ({
    email,
    password,
    name,
    returnPath,
  }: SignUpWithPasswordInput): Promise<
    AuthResult<{ hasSession: boolean }>
  > => {
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { name },
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

  // Global by default: switching accounts on a shared device should not leave
  // the previous person signed in on their other tabs or devices.
  const signOut = async (scope: SignOutScope = "global"): Promise<AuthResult> => {
    try {
      const { error } = await client.auth.signOut({ scope });
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
    registerPasskey,
    listPasskeys,
    deletePasskey,
    signOut,
  };
};

const AUTH_FAILURE_MESSAGES: Record<AuthFailureCode, string> = {
  PASSKEY_CANCELLED:
    "Passkey sign-in cancelled. Choose another sign-in method when ready.",
  PASSKEY_NOT_FOUND: "No passkey was found for this device. Use a password.",
  INVALID_CREDENTIALS: "The email or password was not recognized.",
  RATE_LIMITED: "Too many attempts. Wait a moment, then try again.",
  PASSKEY_FAILED:
    "The passkey could not be used. Try another sign-in method.",
  UNKNOWN: "We could not complete authentication. Try again.",
};

export const authFailureMessage = (code: AuthFailureCode): string =>
  AUTH_FAILURE_MESSAGES[code];
