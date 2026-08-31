# Accessible Authentication and Session-Bound WebMCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give blind users a passkey-first, fully announced authentication journey that automatically exposes this repository's Messenger WebMCP tools under the same Supabase session.

**Architecture:** The webpage authenticates the user through Supabase; WebMCP never handles credentials. A top-level React provider observes the current user, registers either the public connection-status tool or the authenticated tool set, and aborts the old set before logout, account changes, or session-expiry recovery. Same-origin API calls continue to rely on the user's cookie and Supabase row-level security.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9, Supabase Auth/SSR, WebMCP Imperative API, React Hook Form, Vitest, Testing Library, Playwright, and axe-core.

**Spec:** `docs/superpowers/specs/2026-08-30-accessible-auth-webmcp-design.md`

## Global Constraints

- "Messenger" means this repository's own messaging application, not Facebook Messenger or another external service.
- The page owns authentication; no tool schema, result, log, or analytics event may contain a password, one-time code, passkey, cookie, access token, refresh token, or service-role key.
- Passkey is the first action; email-link authentication is the default bootstrap/recovery path; password remains available and must permit paste and autofill.
- The default post-authentication destination is `/conversations`; accepted alternatives are `/users` and `/conversations/<uuid>` only.
- The app adds no second "Connect WebMCP" action. Host-provided permission prompts remain intact.
- `get_connection_status` is the only tool shipped by this feature. The full Messenger tool catalog, Realtime voice, media description, catch-up summarization, and prompt-injection quarantine remain separate scopes.
- Authenticated tools use same-origin `/api/*` routes and the existing request-cookie Supabase client; tool input cannot select the acting user.
- A write interrupted by `AUTH_REQUIRED` is never retried or replayed automatically.
- Use `NEXT_PUBLIC_APP_ORIGIN` for the exact public origin and `NEXT_PUBLIC_PASSKEY_RP_ID` for its hostname. Production enrollment stays disabled when the values do not match the live HTTPS origin.
- Production email confirmation is enabled. Local development may use unconfirmed email accounts only in local Supabase configuration.
- The complete journey targets WCAG 2.2 AA and must work without a microphone.
- Use `npm install --legacy-peer-deps` for dependency changes, matching `SETUP-LOCAL.md`.
- Preserve the unfinished Prisma/Pusher-to-Supabase transport migration as an external prerequisite; do not modify its four route handlers or seven realtime consumers in this plan.

---

## File Structure

| Responsibility | Files |
|---|---|
| Unit/component test foundation | `vitest.config.ts`, `tests/setup.ts`, `package.json`, `package-lock.json` |
| Safe auth destinations | `app/libs/auth/return-path.ts`, `app/auth/callback/route.ts`, `app/libs/supabase/middleware.ts` |
| Auth facade and error contract | `app/libs/auth/auth-gateway.ts` |
| Passkey deployment/capability gate | `app/libs/auth/passkey-readiness.ts`, `app/hooks/use-passkey-readiness.ts` |
| Accessible auth UI | `app/(site)/components/auth-form.tsx`, `app/(site)/components/email-auth-form.tsx`, `app/components/inputs/input.tsx` |
| Passkey bootstrap | `app/components/auth/passkey-enrollment.tsx`, `app/auth/passkey/page.tsx`, `app/components/passkey-manager.tsx` |
| Post-auth focus | `app/libs/auth/focus-after-auth.ts`, `app/components/accessibility/focus-after-auth.tsx` |
| WebMCP protocol boundary | `app/webmcp/browser-api.ts`, `app/webmcp/connection-state.ts`, `app/webmcp/connection-status-tool.ts` |
| Authenticated tool HTTP boundary | `app/webmcp/tool-api-client.ts`, `app/webmcp/tool-registry.ts` |
| WebMCP lifecycle and status UI | `app/webmcp/connection-provider.tsx`, `app/webmcp/connection-status-indicator.tsx`, `app/layout.tsx` |
| Browser and manual verification | `playwright.config.ts`, `e2e/accessible-auth.spec.ts`, `docs/testing/accessible-auth-manual.md`, `scripts/check-passkey-config.mjs` |

Test files live beside their production modules with `.test.ts` or `.test.tsx` suffixes. Browser tests live in `e2e/`.

---

### Task 1: Test Foundation and Safe Authentication Destinations

**Files:**

- Modify: `package.json:5-10`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `app/libs/auth/return-path.ts`
- Create: `app/libs/auth/return-path.test.ts`
- Modify: `app/auth/callback/route.ts:1-22`
- Create: `app/auth/callback/route.test.ts`
- Modify: `app/libs/supabase/middleware.ts:4-45`

**Interfaces:**

- Produces: `DEFAULT_AUTH_RETURN_PATH: "/conversations"`
- Produces: `sanitizeAuthReturnPath(candidate: string | null | undefined): string`
- Produces: `buildAuthLandingPath(candidate: string | null | undefined): string`
- Produces: `buildAuthCallbackUrl(origin: string, returnPath: string, enrollPasskey: boolean): string`
- Produces: `buildPasskeyEnrollmentPath(returnPath: string): string`

- [ ] **Step 1: Install the unit/component test dependencies**

Run:

```bash
npm install --save-dev vitest jsdom @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom --legacy-peer-deps
```

Expected: `package.json` and `package-lock.json` add the seven development dependencies without changing the pinned `@supabase/supabase-js` version.

- [ ] **Step 2: Add the Vitest scripts and configuration**

Add these scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```ts
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
  },
});
```

Create `tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
```

- [ ] **Step 3: Write failing return-path tests**

Create `app/libs/auth/return-path.test.ts` with these cases:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAuthCallbackUrl,
  buildAuthLandingPath,
  buildPasskeyEnrollmentPath,
  sanitizeAuthReturnPath,
} from "./return-path";

describe("sanitizeAuthReturnPath", () => {
  it.each(["/users", "/conversations", "/conversations/5c6e7dd2-5ea2-4878-bd79-63b089ee23f4"])(
    "accepts %s",
    (path) => expect(sanitizeAuthReturnPath(path)).toBe(path)
  );

  it.each([
    undefined,
    null,
    "",
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/conversations/not-a-uuid",
    "/settings",
    "/conversations?next=https://attacker.example",
  ])("replaces unsafe value %s", (path) => {
    expect(sanitizeAuthReturnPath(path)).toBe("/conversations");
  });
});

it("builds encoded sign-in, callback, and enrollment locations", () => {
  const conversation = "/conversations/5c6e7dd2-5ea2-4878-bd79-63b089ee23f4";
  expect(buildAuthLandingPath(conversation)).toBe(
    "/?next=%2Fconversations%2F5c6e7dd2-5ea2-4878-bd79-63b089ee23f4"
  );
  expect(buildAuthCallbackUrl("https://messenger.example", conversation, true)).toBe(
    "https://messenger.example/auth/callback?next=%2Fconversations%2F5c6e7dd2-5ea2-4878-bd79-63b089ee23f4&enroll=passkey"
  );
  expect(buildPasskeyEnrollmentPath(conversation)).toBe(
    "/auth/passkey?next=%2Fconversations%2F5c6e7dd2-5ea2-4878-bd79-63b089ee23f4"
  );
});
```

- [ ] **Step 4: Run the return-path test and confirm the red state**

Run:

```bash
npm test -- app/libs/auth/return-path.test.ts
```

Expected: FAIL because `app/libs/auth/return-path.ts` does not exist.

- [ ] **Step 5: Implement the return-path boundary**

Create `app/libs/auth/return-path.ts`:

```ts
export const DEFAULT_AUTH_RETURN_PATH = "/conversations" as const;

const CONVERSATION_PATH =
  /^\/conversations\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const sanitizeAuthReturnPath = (
  candidate: string | null | undefined
): string => {
  if (candidate === "/users" || candidate === "/conversations") {
    return candidate;
  }
  if (candidate && CONVERSATION_PATH.test(candidate)) return candidate;
  return DEFAULT_AUTH_RETURN_PATH;
};

export const buildAuthLandingPath = (
  candidate: string | null | undefined
): string => `/?next=${encodeURIComponent(sanitizeAuthReturnPath(candidate))}`;

export const buildAuthCallbackUrl = (
  origin: string,
  returnPath: string,
  enrollPasskey: boolean
): string => {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", sanitizeAuthReturnPath(returnPath));
  if (enrollPasskey) url.searchParams.set("enroll", "passkey");
  return url.toString();
};

export const buildPasskeyEnrollmentPath = (returnPath: string): string =>
  `/auth/passkey?next=${encodeURIComponent(
    sanitizeAuthReturnPath(returnPath)
  )}`;
```

- [ ] **Step 6: Write failing callback route tests**

Create `app/auth/callback/route.test.ts`. Mock `createClient()` and assert all three outcomes:

```ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/app/libs/supabase/server";
import { GET } from "./route";

vi.mock("@/app/libs/supabase/server", () => ({ createClient: vi.fn() }));

const exchangeCodeForSession = vi.fn();

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  vi.mocked(createClient).mockResolvedValue({
    auth: { exchangeCodeForSession },
  } as never);
});

describe("GET /auth/callback", () => {
  it("redirects a valid session to the sanitized conversation", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const request = new Request(
      "https://messenger.example/auth/callback?code=good&next=%2Fconversations"
    );
    const response = await GET(request);
    expect(response.headers.get("location")).toBe(
      "https://messenger.example/conversations"
    );
  });

  it("routes new accounts through optional passkey enrollment", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const request = new Request(
      "https://messenger.example/auth/callback?code=good&next=%2Fusers&enroll=passkey"
    );
    const response = await GET(request);
    expect(response.headers.get("location")).toBe(
      "https://messenger.example/auth/passkey?next=%2Fusers"
    );
  });

  it("rejects external destinations and reports an invalid link", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("expired") });
    const request = new Request(
      "https://messenger.example/auth/callback?code=bad&next=https%3A%2F%2Fattacker.example"
    );
    const response = await GET(request);
    expect(response.headers.get("location")).toBe(
      "https://messenger.example/?error=auth_link_invalid&next=%2Fconversations"
    );
  });
});
```

- [ ] **Step 7: Run the callback tests and confirm unsafe/default behavior fails**

Run:

```bash
npm test -- app/auth/callback/route.test.ts
```

Expected: FAIL because the route defaults to `/users`, accepts its raw `next` value, and has no enrollment redirect.

- [ ] **Step 8: Implement sanitized callback and middleware redirects**

In `app/auth/callback/route.ts`, parse `next` with `sanitizeAuthReturnPath()`. On success, use `buildPasskeyEnrollmentPath()` when `enroll=passkey`; otherwise use the safe path. On failure, construct a URL for `/`, set `error=auth_link_invalid`, set the sanitized `next`, and redirect.

Use this complete route body:

```ts
import { NextResponse } from "next/server";
import {
  buildPasskeyEnrollmentPath,
  sanitizeAuthReturnPath,
} from "@/app/libs/auth/return-path";
import { createClient } from "@/app/libs/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnPath = sanitizeAuthReturnPath(url.searchParams.get("next"));
  const enrollPasskey = url.searchParams.get("enroll") === "passkey";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = enrollPasskey
        ? buildPasskeyEnrollmentPath(returnPath)
        : returnPath;
      return NextResponse.redirect(new URL(destination, url.origin));
    }
  }

  const failure = new URL("/", url.origin);
  failure.searchParams.set("error", "auth_link_invalid");
  failure.searchParams.set("next", returnPath);
  return NextResponse.redirect(failure);
}
```

In `app/libs/supabase/middleware.ts`, replace the anonymous redirect block with:

```ts
if (!user && needsAuth) {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("next", sanitizeAuthReturnPath(pathname));
  return NextResponse.redirect(url);
}
```

Import `sanitizeAuthReturnPath` from `@/app/libs/auth/return-path`.

- [ ] **Step 9: Run the task verification**

Run:

```bash
npm test -- app/libs/auth/return-path.test.ts app/auth/callback/route.test.ts
npm run build
```

Expected: both test files PASS and the Next.js build completes.

- [ ] **Step 10: Commit Task 1**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts app/libs/auth/return-path.ts app/libs/auth/return-path.test.ts app/auth/callback/route.ts app/auth/callback/route.test.ts app/libs/supabase/middleware.ts
git commit -m "test: add safe auth redirect boundary"
```

---

### Task 2: WebMCP Types, Connection State, and Status Tool

**Files:**

- Create: `app/webmcp/browser-api.ts`
- Create: `app/webmcp/connection-state.ts`
- Create: `app/webmcp/connection-state.test.ts`
- Create: `app/webmcp/connection-status-tool.ts`
- Create: `app/webmcp/connection-status-tool.test.ts`

**Interfaces:**

- Produces: `WebMCPTool`, `WebMCPModelContext`, and `getWebMCPModelContext()`
- Produces: `ConnectionStatusName`, `ConnectionState`, `ConnectionEvent`, `connectionReducer()`
- Produces: `ConnectionSnapshot` and `connectionMessage()`
- Produces: `createConnectionStatusTool(getSnapshot: () => ConnectionSnapshot): WebMCPTool`

- [ ] **Step 1: Write failing state-machine tests**

Create `app/webmcp/connection-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  connectionMessage,
  connectionReducer,
  initialConnectionState,
} from "./connection-state";

describe("connectionReducer", () => {
  it("moves a signed-in user to connected", () => {
    const ready = connectionReducer(initialConnectionState, {
      type: "SESSION_READY",
      userId: "user-a",
    });
    const registering = connectionReducer(ready, {
      type: "TOOLS_REGISTERING",
      userId: "user-a",
    });
    const connected = connectionReducer(registering, {
      type: "TOOLS_CONNECTED",
      userId: "user-a",
    });
    expect(connected).toEqual({ status: "CONNECTED", userId: "user-a" });
    expect(connectionMessage(connected)).toBe(
      "Signed in. Messenger connected."
    );
  });

  it("represents unavailable, failed, expired, and signed-out states", () => {
    expect(
      connectionReducer(initialConnectionState, {
        type: "TOOLS_UNAVAILABLE",
        userId: "user-a",
      }).status
    ).toBe("SIGNED_IN_TOOLS_UNAVAILABLE");
    expect(
      connectionReducer(initialConnectionState, {
        type: "TOOLS_FAILED",
        userId: "user-a",
      }).status
    ).toBe("SIGNED_IN_TOOLS_FAILED");
    expect(
      connectionReducer(initialConnectionState, { type: "SESSION_EXPIRED" })
        .status
    ).toBe("SESSION_EXPIRED");
    expect(
      connectionReducer(
        { status: "CONNECTED", userId: "user-a" },
        { type: "SIGNED_OUT" }
      )
    ).toEqual(initialConnectionState);
  });
});
```

- [ ] **Step 2: Run the state-machine test and confirm the red state**

Run:

```bash
npm test -- app/webmcp/connection-state.test.ts
```

Expected: FAIL because the connection module does not exist.

- [ ] **Step 3: Implement the narrow browser API and state contract**

Create `app/webmcp/browser-api.ts` with no global augmentation:

```ts
export type JSONSchema = Record<string, unknown>;

export type WebMCPTool = {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute: (
    input: unknown,
    context: { signal: AbortSignal }
  ) => string | Promise<string>;
};

export type WebMCPModelContext = {
  registerTool: (
    tool: WebMCPTool,
    options?: { signal?: AbortSignal }
  ) => Promise<void>;
};

type WebMCPDocument = Document & {
  modelContext?: WebMCPModelContext;
};

export const getWebMCPModelContext = (): WebMCPModelContext | null => {
  if (typeof document === "undefined") return null;
  return (document as WebMCPDocument).modelContext ?? null;
};
```

Create `app/webmcp/connection-state.ts` with this public state union:

```ts
export type ConnectionStatusName =
  | "SIGNED_OUT"
  | "AUTHENTICATING"
  | "SESSION_READY"
  | "TOOLS_REGISTERING"
  | "CONNECTED"
  | "SIGNED_IN_TOOLS_UNAVAILABLE"
  | "SIGNED_IN_TOOLS_FAILED"
  | "SESSION_EXPIRED";

export type ConnectionState = {
  status: ConnectionStatusName;
  userId: string | null;
};

export type ConnectionEvent =
  | { type: "AUTH_STARTED" }
  | { type: "SIGNED_OUT" }
  | { type: "SESSION_READY"; userId: string }
  | { type: "TOOLS_REGISTERING"; userId: string }
  | { type: "TOOLS_CONNECTED"; userId: string }
  | { type: "TOOLS_UNAVAILABLE"; userId: string }
  | { type: "TOOLS_FAILED"; userId: string }
  | { type: "SESSION_EXPIRED" };

export type ConnectionSnapshot = {
  authenticated: boolean;
  state: ConnectionStatusName;
  route: string;
  nextAction: "sign_in_on_page" | "none";
};

export const initialConnectionState: ConnectionState = {
  status: "SIGNED_OUT",
  userId: null,
};

export const connectionReducer = (
  state: ConnectionState,
  event: ConnectionEvent
): ConnectionState => {
  switch (event.type) {
    case "AUTH_STARTED":
      return { status: "AUTHENTICATING", userId: null };
    case "SIGNED_OUT":
      return initialConnectionState;
    case "SESSION_READY":
      return { status: "SESSION_READY", userId: event.userId };
    case "TOOLS_REGISTERING":
      return { status: "TOOLS_REGISTERING", userId: event.userId };
    case "TOOLS_CONNECTED":
      return { status: "CONNECTED", userId: event.userId };
    case "TOOLS_UNAVAILABLE":
      return { status: "SIGNED_IN_TOOLS_UNAVAILABLE", userId: event.userId };
    case "TOOLS_FAILED":
      return { status: "SIGNED_IN_TOOLS_FAILED", userId: event.userId };
    case "SESSION_EXPIRED":
      return { status: "SESSION_EXPIRED", userId: null };
    default:
      return state;
  }
};
```

Implement `connectionReducer()` as a total switch over every event. Implement `connectionMessage()` with these exact user-facing messages:

| State | Message |
|---|---|
| `SIGNED_OUT` | `Sign in required.` |
| `AUTHENTICATING` | `Signing in…` |
| `SESSION_READY` or `TOOLS_REGISTERING` | `Signed in. Connecting Messenger…` |
| `CONNECTED` | `Signed in. Messenger connected.` |
| `SIGNED_IN_TOOLS_UNAVAILABLE` | `Signed in. Messenger is ready; agent tools are unavailable in this browser.` |
| `SIGNED_IN_TOOLS_FAILED` | `Signed in. Agent tools could not connect.` |
| `SESSION_EXPIRED` | `Your session expired. Nothing was sent. Sign in again.` |

Keep the copy exhaustive and centralized:

```ts
const CONNECTION_MESSAGES: Record<ConnectionState["status"], string> = {
  SIGNED_OUT: "Sign in required.",
  AUTHENTICATING: "Signing in…",
  SESSION_READY: "Signed in. Connecting Messenger…",
  TOOLS_REGISTERING: "Signed in. Connecting Messenger…",
  CONNECTED: "Signed in. Messenger connected.",
  SIGNED_IN_TOOLS_UNAVAILABLE:
    "Signed in. Messenger is ready; agent tools are unavailable in this browser.",
  SIGNED_IN_TOOLS_FAILED: "Signed in. Agent tools could not connect.",
  SESSION_EXPIRED: "Your session expired. Nothing was sent. Sign in again.",
};

export const connectionMessage = (state: ConnectionState): string =>
  CONNECTION_MESSAGES[state.status];
```

- [ ] **Step 4: Write failing connection-status tool tests**

Create `app/webmcp/connection-status-tool.test.ts`:

```ts
import { expect, it } from "vitest";
import { createConnectionStatusTool } from "./connection-status-tool";

it("returns a non-sensitive live snapshot", async () => {
  let route = "/";
  const tool = createConnectionStatusTool(() => ({
    authenticated: false,
    state: "SIGNED_OUT",
    route,
    nextAction: "sign_in_on_page",
  }));

  expect(tool.name).toBe("get_connection_status");
  expect(tool.annotations).toEqual({
    readOnlyHint: true,
    untrustedContentHint: false,
  });
  expect(JSON.parse(await tool.execute({}, { signal: new AbortController().signal }))).toEqual({
    authenticated: false,
    state: "SIGNED_OUT",
    route: "/",
    nextAction: "sign_in_on_page",
  });

  route = "/conversations";
  expect(JSON.parse(await tool.execute({}, { signal: new AbortController().signal })).route).toBe(
    "/conversations"
  );
});
```

- [ ] **Step 5: Run the status-tool test and confirm the red state**

Run:

```bash
npm test -- app/webmcp/connection-status-tool.test.ts
```

Expected: FAIL because `createConnectionStatusTool` is not defined.

- [ ] **Step 6: Implement the connection-status tool**

Create `app/webmcp/connection-status-tool.ts`:

```ts
import type { WebMCPTool } from "./browser-api";
import type { ConnectionSnapshot } from "./connection-state";

export const createConnectionStatusTool = (
  getSnapshot: () => ConnectionSnapshot
): WebMCPTool => ({
  name: "get_connection_status",
  description:
    "Report whether this Messenger page is signed in and whether its agent tools are connected. Use before requesting Messenger actions.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: false,
  },
  execute: async () => JSON.stringify(getSnapshot()),
});
```

- [ ] **Step 7: Run Task 2 verification**

Run:

```bash
npm test -- app/webmcp/connection-state.test.ts app/webmcp/connection-status-tool.test.ts
npx tsc --noEmit
```

Expected: both tests PASS and TypeScript reports no errors.

- [ ] **Step 8: Commit Task 2**

```bash
git add app/webmcp/browser-api.ts app/webmcp/connection-state.ts app/webmcp/connection-state.test.ts app/webmcp/connection-status-tool.ts app/webmcp/connection-status-tool.test.ts
git commit -m "feat: define WebMCP connection state"
```

---

### Task 3: Authenticated Tool API Client and Scoped Registry

**Files:**

- Create: `app/webmcp/tool-api-client.ts`
- Create: `app/webmcp/tool-api-client.test.ts`
- Create: `app/webmcp/tool-registry.ts`
- Create: `app/webmcp/tool-registry.test.ts`

**Interfaces:**

- Consumes: `WebMCPTool`, `ConnectionSnapshot`, `createConnectionStatusTool()`
- Produces: `ToolApiErrorCode`, `ToolApiError`, `ToolApiClient`
- Produces: `createToolApiClient(options: ToolApiClientOptions): ToolApiClient`
- Produces: `WebMCPToolRegistry`, `defaultToolRegistry`

- [ ] **Step 1: Write failing authenticated API-client tests**

Create `app/webmcp/tool-api-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createToolApiClient } from "./tool-api-client";

describe("createToolApiClient", () => {
  it("uses same-origin credentials and returns JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = createToolApiClient({
      signal: new AbortController().signal,
      onAuthRequired: vi.fn(),
      fetcher,
    });
    await expect(client.request<{ ok: boolean }>("/api/example")).resolves.toEqual({
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });

  it("reports AUTH_REQUIRED once and never retries", async () => {
    const onAuthRequired = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const client = createToolApiClient({
      signal: new AbortController().signal,
      onAuthRequired,
      fetcher,
    });
    await expect(client.request("/api/messages", { method: "POST" })).rejects.toEqual(
      expect.objectContaining({ code: "AUTH_REQUIRED" })
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the API-client test and confirm the red state**

Run:

```bash
npm test -- app/webmcp/tool-api-client.test.ts
```

Expected: FAIL because the API client does not exist.

- [ ] **Step 3: Implement the authenticated API client**

Create `app/webmcp/tool-api-client.ts` with these exact public types:

```ts
export type ToolApiErrorCode =
  | "AUTH_REQUIRED"
  | "REQUEST_FAILED"
  | "INVALID_RESPONSE";

export class ToolApiError extends Error {
  constructor(
    public readonly code: ToolApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ToolApiError";
  }
}

export type ToolApiClient = {
  request<T>(
    path: string,
    init?: Omit<RequestInit, "credentials" | "signal">
  ): Promise<T>;
};

export type ToolApiClientOptions = {
  signal: AbortSignal;
  onAuthRequired: () => void;
  fetcher?: typeof fetch;
};
```

`createToolApiClient()` must make exactly one fetch with `credentials: "same-origin"` and the lifecycle signal. A 401 invokes `onAuthRequired()` once and throws `ToolApiError("AUTH_REQUIRED", "Sign in again.")`. Other non-2xx responses throw `REQUEST_FAILED` with `Request failed with status <number>.`. A successful response whose JSON parse fails throws `INVALID_RESPONSE` with `The server returned an invalid response.`. Do not retry any branch.

Implement it as:

```ts
export const createToolApiClient = ({
  signal,
  onAuthRequired,
  fetcher = fetch,
}: ToolApiClientOptions): ToolApiClient => ({
  async request<T>(path, init) {
    const response = await fetcher(path, {
      ...init,
      credentials: "same-origin",
      signal,
    });

    if (response.status === 401) {
      onAuthRequired();
      throw new ToolApiError("AUTH_REQUIRED", "Sign in again.");
    }
    if (!response.ok) {
      throw new ToolApiError(
        "REQUEST_FAILED",
        `Request failed with status ${response.status}.`
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ToolApiError(
        "INVALID_RESPONSE",
        "The server returned an invalid response."
      );
    }
  },
});
```

- [ ] **Step 4: Write failing registry scope tests**

Create `app/webmcp/tool-registry.test.ts`:

```ts
import { expect, it, vi } from "vitest";
import { defaultToolRegistry } from "./tool-registry";

const getSnapshot = vi.fn(() => ({
  authenticated: false,
  state: "SIGNED_OUT" as const,
  route: "/",
  nextAction: "sign_in_on_page" as const,
}));

it("ships only connection status in public and authenticated scopes", () => {
  expect(defaultToolRegistry.getPublicTools({ getSnapshot }).map((tool) => tool.name)).toEqual([
    "get_connection_status",
  ]);
  expect(
    defaultToolRegistry
      .getAuthenticatedTools({
        getSnapshot,
        apiClient: { request: vi.fn() },
      })
      .map((tool) => tool.name)
  ).toEqual(["get_connection_status"]);
});
```

- [ ] **Step 5: Implement the scoped registry contract**

Create `app/webmcp/tool-registry.ts`:

```ts
import type { WebMCPTool } from "./browser-api";
import type { ConnectionSnapshot } from "./connection-state";
import { createConnectionStatusTool } from "./connection-status-tool";
import type { ToolApiClient } from "./tool-api-client";

export type PublicToolContext = {
  getSnapshot: () => ConnectionSnapshot;
};

export type AuthenticatedToolContext = PublicToolContext & {
  apiClient: ToolApiClient;
};

export type WebMCPToolRegistry = {
  getPublicTools(context: PublicToolContext): WebMCPTool[];
  getAuthenticatedTools(context: AuthenticatedToolContext): WebMCPTool[];
};

export const defaultToolRegistry: WebMCPToolRegistry = {
  getPublicTools: ({ getSnapshot }) => [
    createConnectionStatusTool(getSnapshot),
  ],
  getAuthenticatedTools: ({ getSnapshot }) => [
    createConnectionStatusTool(getSnapshot),
  ],
};
```

The separate Messenger tool-catalog feature extends only `getAuthenticatedTools()`.

- [ ] **Step 6: Run Task 3 verification**

Run:

```bash
npm test -- app/webmcp/tool-api-client.test.ts app/webmcp/tool-registry.test.ts
npx tsc --noEmit
```

Expected: both tests PASS; the 401 test observes one request and one auth-required notification.

- [ ] **Step 7: Commit Task 3**

```bash
git add app/webmcp/tool-api-client.ts app/webmcp/tool-api-client.test.ts app/webmcp/tool-registry.ts app/webmcp/tool-registry.test.ts
git commit -m "feat: add authenticated WebMCP tool boundary"
```

---

### Task 4: Top-Level WebMCP Connection Provider

**Files:**

- Create: `app/webmcp/connection-provider.tsx`
- Create: `app/webmcp/connection-provider.test.tsx`
- Create: `app/webmcp/connection-status-indicator.tsx`
- Modify: `app/layout.tsx:5-38`

**Interfaces:**

- Consumes: `useCurrentUser()`, `WebMCPModelContext`, `WebMCPToolRegistry`, `createToolApiClient()`
- Produces: `WebMCPConnectionProvider`
- Produces: `useWebMCPConnection(): WebMCPConnectionContextValue`
- Produces: `beginAuthentication()`, `returnToSignedOut(message)`, `announce(message)`, `reportSessionExpired()`

- [ ] **Step 1: Write failing provider lifecycle tests**

Create `app/webmcp/connection-provider.test.tsx`. Use a fake model context whose `registerTool()` stores tool names and records the supplied signal's abort event. Cover these exact cases:

Define the test helpers in the same file:

```tsx
const ConnectionProbe = () => {
  const connection = useWebMCPConnection();
  return (
    <>
      <output>{connection.message}</output>
      <button type="button" onClick={connection.reportSessionExpired}>
        Expire session
      </button>
    </>
  );
};

const createFakeModelContext = () => {
  const registrations: Array<{ name: string; aborted: boolean }> = [];
  const context: WebMCPModelContext = {
    registerTool: async (tool, options) => {
      const registration = { name: tool.name, aborted: false };
      registrations.push(registration);
      options?.signal?.addEventListener(
        "abort",
        () => {
          registration.aborted = true;
        },
        { once: true }
      );
    },
  };
  return Object.assign(context, {
    activeNames: () =>
      registrations.filter((item) => !item.aborted).map((item) => item.name),
    abortedRegistrationCount: () =>
      registrations.filter((item) => item.aborted).length,
  });
};

const createStubTool = (name: string): WebMCPTool => ({
  name,
  description: `${name} test tool`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, untrustedContentHint: false },
  execute: async () => JSON.stringify({ ok: true }),
});

const lifecycleTestRegistry: WebMCPToolRegistry = {
  getPublicTools: () => [createStubTool("get_connection_status")],
  getAuthenticatedTools: () => [
    createStubTool("get_connection_status"),
    createStubTool("test_authenticated_messenger_action"),
  ],
};
```

```tsx
it("replaces public tools with authenticated tools and aborts on sign-out", async () => {
  const modelContext = createFakeModelContext();
  const { rerender } = render(
    <WebMCPConnectionProvider
      modelContext={modelContext}
      currentUserId={null}
      registry={lifecycleTestRegistry}
    >
      <ConnectionProbe />
    </WebMCPConnectionProvider>
  );
  await screen.findByText("Sign in required.");
  expect(modelContext.activeNames()).toEqual(["get_connection_status"]);

  rerender(
    <WebMCPConnectionProvider
      modelContext={modelContext}
      currentUserId="user-a"
      registry={lifecycleTestRegistry}
    >
      <ConnectionProbe />
    </WebMCPConnectionProvider>
  );
  await screen.findByText("Signed in. Messenger connected.");
  expect(modelContext.abortedRegistrationCount()).toBe(1);
  expect(modelContext.activeNames()).toEqual([
    "get_connection_status",
    "test_authenticated_messenger_action",
  ]);

  rerender(
    <WebMCPConnectionProvider
      modelContext={modelContext}
      currentUserId={null}
      registry={lifecycleTestRegistry}
    >
      <ConnectionProbe />
    </WebMCPConnectionProvider>
  );
  await screen.findByText("Sign in required.");
  expect(modelContext.abortedRegistrationCount()).toBe(3);
  expect(modelContext.activeNames()).toEqual(["get_connection_status"]);
});
```

Also assert:

- rerendering with the same `currentUserId` does not register a second tool set or produce a second live-region announcement;
- changing from `user-a` to `user-b` aborts `user-a` before registering `user-b`;
- one rejected registration aborts every partial registration and shows `Signed in. Agent tools could not connect.`;
- `modelContext={null}` with a user shows the degraded-browser message;
- `reportSessionExpired()` aborts the active tools, calls the injected `clearSession()` once, and announces `Your session expired. Nothing was sent. Sign in again.`;
- `beginAuthentication()` announces `Signing in…` through one `role="status"` region.

- [ ] **Step 2: Run the provider test and confirm the red state**

Run:

```bash
npm test -- app/webmcp/connection-provider.test.tsx
```

Expected: FAIL because the provider and indicator do not exist.

- [ ] **Step 3: Implement the provider context contract**

In `app/webmcp/connection-provider.tsx`, export:

```ts
export type WebMCPConnectionContextValue = {
  state: ConnectionState;
  message: string;
  announce: (message: string) => void;
  beginAuthentication: () => void;
  returnToSignedOut: (message: string) => void;
  reportSessionExpired: () => void;
  retryConnection: () => void;
};

export type WebMCPConnectionProviderProps = PropsWithChildren<{
  modelContext?: WebMCPModelContext | null;
  currentUserId?: string | null;
  registry?: WebMCPToolRegistry;
  clearSession?: () => Promise<void>;
}>;
```

`undefined` means "use the production dependency": detect `document.modelContext`, read `useCurrentUser()?.id`, use `defaultToolRegistry`, and clear an expired local Supabase session with `createClient().auth.signOut({ scope: "local" })`. Explicit `null` means an unavailable model context or signed-out test user.

Keep the announced string separately from the reducer state. `beginAuthentication()` dispatches `AUTH_STARTED` and announces `Signing in…`; `returnToSignedOut(message)` dispatches `SIGNED_OUT` and announces its supplied fixed message; `announce(message)` changes only the live-region string. Each session/tool lifecycle transition replaces the announcement with `connectionMessage(nextState)`. This prevents a failed or cancelled auth attempt from remaining stuck in `AUTHENTICATING`.

The registration effect must:

1. Abort the previous controller in cleanup.
2. Increment a generation ref before each registration attempt.
3. Dispatch `SESSION_READY` then `TOOLS_REGISTERING` for a user.
4. Build a `ToolApiClient` with the same controller signal.
5. Use `Promise.all()` to register the complete scoped tool list.
6. Enter `CONNECTED` only when every registration resolves and the generation is still current.
7. Abort the controller before entering `SIGNED_IN_TOOLS_FAILED` after any rejection.
8. Depend on the derived user ID, not the complete Supabase user object, so token refresh does not duplicate tools.

Keep a `ConnectionSnapshot` in a ref so `get_connection_status` reads the latest pathname without re-registering on navigation.

- [ ] **Step 4: Implement the visible and announced status indicator**

Create `app/webmcp/connection-status-indicator.tsx`. Render one visible status label and one atomic polite live region:

```tsx
<div className="fixed bottom-4 right-4 z-40 rounded-full bg-white px-3 py-2 text-sm text-gray-700 shadow">
  <span aria-hidden="true">{visibleLabel}</span>
  <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {message}
  </span>
</div>
```

Use these visible labels: `Sign in required`, `Signing in`, `Connecting Messenger`, `Messenger connected`, `Agent tools unavailable`, `Connection failed`, and `Session expired`.

For `SIGNED_IN_TOOLS_FAILED`, render a keyboard-operable `Retry agent connection` button that increments the provider's registration attempt. For `SESSION_EXPIRED`, render a normal link whose href is `buildAuthLandingPath(current pathname)` and whose text is `Sign in again`.

Implement `retryConnection()` by incrementing a numeric `registrationAttempt` state value that is included in the registration effect dependencies. It must not alter the current user or create a second active controller.

- [ ] **Step 5: Mount the provider in the top-level document**

Modify `app/layout.tsx` so the nesting is exactly:

```tsx
<CurrentUserProvider initialUser={user}>
  <WebMCPConnectionProvider>
    <aside>
      <ToasterContext />
    </aside>
    <ConnectionStatusIndicator />
    <ActiveStatus />
    {children}
  </WebMCPConnectionProvider>
</CurrentUserProvider>
```

This keeps registration in the top-level document and outside iframes.

- [ ] **Step 6: Run Task 4 verification**

Run:

```bash
npm test -- app/webmcp/connection-provider.test.tsx
npx tsc --noEmit
npm run build
```

Expected: lifecycle tests PASS, TypeScript is clean, and the app builds.

- [ ] **Step 7: Commit Task 4**

```bash
git add app/webmcp/connection-provider.tsx app/webmcp/connection-provider.test.tsx app/webmcp/connection-status-indicator.tsx app/layout.tsx
git commit -m "feat: bind WebMCP tools to the user session"
```

---

### Task 5: Accessible Input Contract and Supabase Auth Gateway

**Files:**

- Modify: `app/components/inputs/input.tsx:1-60`
- Create: `app/components/inputs/input.test.tsx`
- Create: `app/libs/auth/auth-gateway.ts`
- Create: `app/libs/auth/auth-gateway.test.ts`

**Interfaces:**

- Consumes: `buildAuthCallbackUrl()` and the existing Supabase browser client
- Produces: generic `Input<T extends FieldValues>` with native and ARIA validation
- Produces: `AuthFailureCode`, `AuthResult<T>`, `PasskeyRecord`, `AuthGateway`
- Produces: `createAuthGateway(client?, appOrigin?): AuthGateway`
- Produces: `authFailureMessage(code: AuthFailureCode): string`

- [ ] **Step 1: Write failing accessible-input tests**

Create this React Hook Form harness in `app/components/inputs/input.test.tsx`:

```tsx
type FormValues = { password: string };

const Harness = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  return (
    <form onSubmit={handleSubmit(() => undefined)}>
      <Input<FormValues>
        id="password"
        label="Password"
        type="password"
        required
        autoComplete="current-password"
        register={register}
        errors={errors}
      />
      <button type="submit">Submit</button>
    </form>
  );
};
```

Render `<Harness />` and assert:

```tsx
expect(screen.getByLabelText("Password")).toBeRequired();
expect(screen.getByLabelText("Password")).toHaveAttribute(
  "autocomplete",
  "current-password"
);
await user.click(screen.getByRole("button", { name: "Submit" }));
expect(screen.getByLabelText("Password")).toHaveAttribute(
  "aria-invalid",
  "true"
);
expect(screen.getByText("Password is required.")).toHaveAttribute(
  "id",
  "password-error"
);
expect(screen.getByLabelText("Password")).toHaveAttribute(
  "aria-describedby",
  "password-error"
);
```

- [ ] **Step 2: Run the input test and confirm the red state**

Run:

```bash
npm test -- app/components/inputs/input.test.tsx
```

Expected: FAIL because the input lacks native required/error semantics and uses `password` as the autocomplete value.

- [ ] **Step 3: Implement the generic accessible input**

Change `InputProps` to:

```ts
type InputProps<T extends FieldValues> = {
  label: string;
  id: Path<T>;
  type?: HTMLInputTypeAttribute;
  required?: boolean;
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  placeholder?: string;
  disabled?: boolean;
  autoComplete: string;
  registerOptions?: RegisterOptions<T, Path<T>>;
};
```

Render native `required`, `aria-invalid`, and `aria-describedby`. Merge `registerOptions` with a required message of `<label> is required.`. Render a `<p id="<id>-error">` only when the field error has a string message.

- [ ] **Step 4: Write failing auth-gateway tests**

Create `app/libs/auth/auth-gateway.test.ts` with a fake Supabase client and assert:

- passkey `NotAllowedError` maps to `PASSKEY_CANCELLED`;
- `webauthn_credential_not_found` maps to `PASSKEY_NOT_FOUND`;
- `invalid_credentials` maps to `INVALID_CREDENTIALS`;
- email rate limiting maps to `RATE_LIMITED`;
- unknown errors map to `UNKNOWN` and never expose the raw message;
- `sendEmailLink()` calls `signInWithOtp()` with `shouldCreateUser` and the callback URL;
- `signUpWithPassword()` sends name metadata and the passkey-enrollment callback URL;
- `signInWithPassword()` reports success without returning the Supabase session;
- passkey list/add/delete methods return only `PasskeyRecord` data or a normalized failure.

Use this assertion for the link boundary:

```ts
expect(signInWithOtp).toHaveBeenCalledWith({
  email: "blind.user@example.org",
  options: {
    shouldCreateUser: true,
    emailRedirectTo:
      "https://messenger.example/auth/callback?next=%2Fconversations&enroll=passkey",
    data: { name: "Blind User" },
  },
});
```

- [ ] **Step 5: Implement the auth-gateway contract**

Create these public types in `app/libs/auth/auth-gateway.ts`:

```ts
export type AuthFailureCode =
  | "PASSKEY_CANCELLED"
  | "PASSKEY_NOT_FOUND"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "EMAIL_LINK_FAILED"
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
  sendEmailLink(input: {
    email: string;
    name?: string;
    returnPath: string;
    shouldCreateUser: boolean;
  }): Promise<AuthResult>;
  registerPasskey(): Promise<AuthResult>;
  listPasskeys(): Promise<AuthResult<PasskeyRecord[]>>;
  deletePasskey(passkeyId: string): Promise<AuthResult>;
};
```

`createAuthGateway(client = createClient(), appOrigin = resolveAppOrigin())` wraps Supabase and never returns a user, session, cookie, or token. `resolveAppOrigin()` returns `NEXT_PUBLIC_APP_ORIGIN` when configured and otherwise returns `window.location.origin` in the browser; it throws `App origin is unavailable.` during server execution without configuration. Tests pass their fake client and `https://messenger.example` explicitly. `authFailureMessage()` returns fixed copy for every code; do not return `error.message` to UI code.

Keep Supabase request details inside the gateway. Derive the internal input aliases from the public contract so the signatures cannot drift:

```ts
type SendEmailLinkInput = Parameters<AuthGateway["sendEmailLink"]>[0];
type SignUpWithPasswordInput = Parameters<AuthGateway["signUpWithPassword"]>[0];

const sendEmailLink = async ({
  email,
  name,
  shouldCreateUser,
  returnPath,
}: SendEmailLinkInput): Promise<AuthResult> => {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser,
      emailRedirectTo: buildAuthCallbackUrl(
        appOrigin,
        returnPath,
        shouldCreateUser
      ),
      data: name ? { name } : undefined,
    },
  });
  return error ? normalizeAuthFailure(error) : { ok: true, value: undefined };
};

const signUpWithPassword = async ({
  email,
  password,
  name,
  returnPath,
}: SignUpWithPasswordInput): Promise<AuthResult<{ hasSession: boolean }>> => {
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
    : { ok: true, value: { hasSession: Boolean(data.session) } };
};
```

Normalize errors with these exact rules:

| Error input | `AuthFailureCode` |
|---|---|
| `name` is `NotAllowedError` or `AbortError` | `PASSKEY_CANCELLED` |
| `code` is `webauthn_credential_not_found` | `PASSKEY_NOT_FOUND` |
| `code` is `invalid_credentials` | `INVALID_CREDENTIALS` |
| `code` contains `rate_limit` | `RATE_LIMITED` |
| unknown error from `signInWithOtp` | `EMAIL_LINK_FAILED` |
| unknown error from passkey registration/sign-in | `PASSKEY_FAILED` |
| every other unknown error | `UNKNOWN` |

Return these exact messages from `authFailureMessage()`:

| Code | Message |
|---|---|
| `PASSKEY_CANCELLED` | `Passkey sign-in cancelled. Choose another sign-in method when ready.` |
| `PASSKEY_NOT_FOUND` | `No passkey was found for this device. Use an email link or password.` |
| `INVALID_CREDENTIALS` | `The email or password was not recognized.` |
| `RATE_LIMITED` | `Too many attempts. Wait a moment, then try again.` |
| `EMAIL_LINK_FAILED` | `We could not send the sign-in link. Try again.` |
| `PASSKEY_FAILED` | `The passkey could not be used. Try another sign-in method.` |
| `UNKNOWN` | `We could not complete authentication. Try again.` |

- [ ] **Step 6: Run Task 5 verification**

Run:

```bash
npm test -- app/components/inputs/input.test.tsx app/libs/auth/auth-gateway.test.ts
npx tsc --noEmit
```

Expected: accessible-input and gateway tests PASS with no raw Supabase messages in rendered or returned values.

- [ ] **Step 7: Commit Task 5**

```bash
git add app/components/inputs/input.tsx app/components/inputs/input.test.tsx app/libs/auth/auth-gateway.ts app/libs/auth/auth-gateway.test.ts
git commit -m "feat: add accessible auth primitives"
```

---

### Task 6: Passkey Readiness, Enrollment, and Settings Recovery

**Files:**

- Create: `app/libs/auth/passkey-readiness.ts`
- Create: `app/libs/auth/passkey-readiness.test.ts`
- Create: `app/hooks/use-passkey-readiness.ts`
- Create: `app/components/auth/passkey-enrollment.tsx`
- Create: `app/components/auth/passkey-enrollment.test.tsx`
- Create: `app/auth/passkey/page.tsx`
- Modify: `app/components/passkey-manager.tsx:1-146`
- Create: `app/components/passkey-manager.test.tsx`
- Modify: `app/libs/supabase/middleware.ts:4-5`
- Modify: `.env.example:1-37`
- Modify: `SETUP-LOCAL.md:48-56`

**Interfaces:**

- Consumes: `AuthGateway`, `useWebMCPConnection()`, `sanitizeAuthReturnPath()`
- Produces: `PasskeyReadiness`, `evaluatePasskeyReadiness()`, `usePasskeyReadiness()`
- Produces: reusable `PasskeyEnrollment`

- [ ] **Step 1: Write failing passkey-readiness tests**

Create `app/libs/auth/passkey-readiness.test.ts` and cover:

```ts
expect(
  evaluatePasskeyReadiness({
    currentOrigin: "https://messenger.example",
    configuredOrigin: "https://messenger.example",
    rpId: "messenger.example",
    hasWebAuthn: true,
  })
).toEqual({ status: "ready", message: "Passkeys are available." });

expect(
  evaluatePasskeyReadiness({
    currentOrigin: "https://preview.example",
    configuredOrigin: "https://messenger.example",
    rpId: "messenger.example",
    hasWebAuthn: true,
  }).status
).toBe("misconfigured");

expect(
  evaluatePasskeyReadiness({
    currentOrigin: "https://messenger.example",
    configuredOrigin: "https://messenger.example",
    rpId: "wrong.example",
    hasWebAuthn: true,
  }).status
).toBe("misconfigured");

expect(
  evaluatePasskeyReadiness({
    currentOrigin: "https://messenger.example",
    configuredOrigin: "https://messenger.example",
    rpId: "messenger.example",
    hasWebAuthn: false,
  }).status
).toBe("unsupported");
```

- [ ] **Step 2: Run the readiness tests and confirm the red state**

Run:

```bash
npm test -- app/libs/auth/passkey-readiness.test.ts
```

Expected: FAIL because the readiness module does not exist.

- [ ] **Step 3: Implement readiness evaluation and browser hook**

Create this union in `app/libs/auth/passkey-readiness.ts`:

```ts
export type PasskeyReadiness =
  | { status: "checking"; message: "Checking passkey support…" }
  | { status: "ready"; message: "Passkeys are available." }
  | {
      status: "unsupported";
      message: "Passkeys are not supported in this browser. Use an email link or password.";
    }
  | {
      status: "misconfigured";
      message: "Passkeys are temporarily unavailable. Use an email link or password.";
    };
```

`evaluatePasskeyReadiness()` returns `misconfigured` when either URL cannot be parsed, the current origin differs from `configuredOrigin`, or the configured URL hostname differs from `rpId`. It permits `http://localhost` for local development and requires HTTPS for every non-local hostname.

`usePasskeyReadiness()` starts at `checking`, then evaluates after mount using `window.location.origin`, `window.PublicKeyCredential`, `NEXT_PUBLIC_APP_ORIGIN`, and `NEXT_PUBLIC_PASSKEY_RP_ID`. In non-CI local development only, missing public values default to `http://localhost:3000` and `localhost`.

- [ ] **Step 4: Write failing enrollment component tests**

In `app/components/auth/passkey-enrollment.test.tsx`, inject a fake gateway and assert:

- readiness `ready` enables `Set up passkey`;
- success announces `Passkey saved. Next time, one action.` and navigates to the sanitized destination;
- cancellation restores focus to `Set up passkey` and announces the cancellation message;
- `Maybe later` navigates without enrolling;
- `unsupported` or `misconfigured` disables enrollment, exposes the readiness explanation, and leaves `Maybe later` enabled.

- [ ] **Step 5: Run the enrollment tests and confirm the red state**

Run:

```bash
npm test -- app/components/auth/passkey-enrollment.test.tsx
```

Expected: FAIL because the enrollment component does not exist.

- [ ] **Step 6: Implement enrollment component and protected page**

Create `PasskeyEnrollment` with this interface:

```ts
type PasskeyEnrollmentProps = {
  returnPath: string;
  gateway?: AuthGateway;
};
```

Use `router.replace(sanitizeAuthReturnPath(returnPath))` for success and skip. Use `useWebMCPConnection().announce()` for all outcomes. Restore focus with a button ref after cancellation.

Keep the primary action branch explicit:

```tsx
const enroll = async () => {
  setIsBusy(true);
  const result = await gateway.registerPasskey();
  setIsBusy(false);

  if (result.ok) {
    announce("Passkey saved. Next time, one action.");
    router.replace(sanitizeAuthReturnPath(returnPath));
    return;
  }

  announce(authFailureMessage(result.code));
  if (result.code === "PASSKEY_CANCELLED") {
    requestAnimationFrame(() => enrollButtonRef.current?.focus());
  }
};
```

Create `app/auth/passkey/page.tsx` as an async server page that reads `searchParams.next`, sanitizes it, renders one `<h1>Add a passkey?</h1>`, explains device PIN/biometric/security-key options, and renders `PasskeyEnrollment`.

Add `"/auth/passkey"` to the middleware's `PROTECTED` list so the callback cannot expose enrollment to an anonymous visitor.

- [ ] **Step 7: Write failing passkey-manager recovery tests**

In `app/components/passkey-manager.test.tsx`, assert that an unsupported browser still renders the existing passkey list and remove controls, while `Add a passkey` is disabled with the readiness explanation. Also assert successful removal refreshes the list and announces `Passkey removed.` through the shared connection status rather than raw toast copy.

- [ ] **Step 8: Run the passkey-manager tests and confirm the red state**

Run:

```bash
npm test -- app/components/passkey-manager.test.tsx
```

Expected: FAIL because the current manager hides itself without WebAuthn and reports outcomes only through toasts.

- [ ] **Step 9: Refactor settings passkey management**

Replace direct Supabase calls in `PasskeyManager` with `AuthGateway`. Always call `listPasskeys()`, even when WebAuthn enrollment is unavailable. Disable only the add action when readiness is not `ready`; keep deletion available. Replace raw error toasts with `authFailureMessage()` passed to `announce()`.

Use these handler branches:

```ts
const add = async () => {
  setIsBusy(true);
  const result = await gateway.registerPasskey();
  if (result.ok) {
    announce("Passkey added.");
    await refresh();
  } else {
    announce(authFailureMessage(result.code));
  }
  setIsBusy(false);
};

const remove = async (id: string) => {
  setIsBusy(true);
  const result = await gateway.deletePasskey(id);
  if (result.ok) {
    announce("Passkey removed.");
    await refresh();
  } else {
    announce(authFailureMessage(result.code));
  }
  setIsBusy(false);
};
```

- [ ] **Step 10: Add exact passkey environment documentation**

Remove stale NextAuth/GitHub/Google auth variables from `.env.example`. Add:

```dotenv
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_PASSKEY_RP_ID=localhost
```

Preserve the existing Supabase URL and anon-key example entries. Update `SETUP-LOCAL.md` to state that production must use its exact HTTPS origin and hostname, and that changing the Supabase relying-party ID invalidates enrolled passkeys. Remove its stale social-login claim.

- [ ] **Step 11: Run Task 6 verification**

Run:

```bash
npm test -- app/libs/auth/passkey-readiness.test.ts app/components/auth/passkey-enrollment.test.tsx app/components/passkey-manager.test.tsx
npx tsc --noEmit
npm run build
```

Expected: readiness, enrollment, and settings tests PASS; the protected page builds.

- [ ] **Step 12: Commit Task 6**

```bash
git add app/libs/auth/passkey-readiness.ts app/libs/auth/passkey-readiness.test.ts app/hooks/use-passkey-readiness.ts app/components/auth/passkey-enrollment.tsx app/components/auth/passkey-enrollment.test.tsx app/auth/passkey/page.tsx app/components/passkey-manager.tsx app/components/passkey-manager.test.tsx app/libs/supabase/middleware.ts .env.example SETUP-LOCAL.md
git commit -m "feat: gate and recover passkey enrollment"
```

---

### Task 7: Complete the Accessible Sign-In and Post-Auth Focus Journey

**Files:**

- Create: `app/(site)/components/email-auth-form.tsx`
- Create: `app/(site)/components/email-auth-form.test.tsx`
- Modify: `app/(site)/components/auth-form.tsx:1-264`
- Create: `app/(site)/components/auth-form.test.tsx`
- Modify: `app/(site)/page.tsx:1-25`
- Create: `app/libs/auth/focus-after-auth.ts`
- Create: `app/components/accessibility/focus-after-auth.tsx`
- Create: `app/components/accessibility/focus-after-auth.test.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/components/sidebar/sidebar.tsx:7-15`
- Modify: `app/conversations/page.tsx:8-15`
- Modify: `app/users/page.tsx:3-8`
- Modify: `app/conversations/[conversationId]/components/header.tsx:39-66`

**Interfaces:**

- Consumes: `AuthGateway`, `usePasskeyReadiness()`, `useWebMCPConnection()`, safe return-path helpers
- Produces: `AuthForm({ returnPath, callbackError })`
- Produces: `EmailAuthForm({ variant, returnPath, gateway, onAuthenticated, onPasskeyEnrollment })`
- Produces: `markFocusAfterAuth()`, `consumeFocusAfterAuth()`, and `FocusAfterAuth`

- [ ] **Step 1: Write failing email-auth form tests**

Create `app/(site)/components/email-auth-form.test.tsx`. With a fake gateway and connection provider, assert this semantic order:

```ts
const controls = screen.getAllByRole("button");
expect(controls.map((control) => control.textContent)).toEqual([
  "Email me a sign-in link",
  "Sign in with password",
]);
```

Assert these behaviors:

- empty email focuses an alert summary and sets `aria-invalid` on email;
- password submission with an empty password shows `Password is required.` without erasing email;
- login email-link calls `sendEmailLink({ shouldCreateUser: false })`;
- registration email-link requires name and calls `sendEmailLink({ shouldCreateUser: true })`;
- a sent link announces `Check your email for a sign-in link.`;
- invalid credentials announce the fixed gateway message, never the fake raw provider error;
- password registration with `hasSession: true` calls `onPasskeyEnrollment()`;
- password registration with `hasSession: false` announces the email-check message.

- [ ] **Step 2: Run the email-auth form tests and confirm the red state**

Run:

```bash
npm test -- "app/(site)/components/email-auth-form.test.tsx"
```

Expected: FAIL because the focused email-auth form does not exist.

- [ ] **Step 3: Implement the focused email-auth form**

Use this strong form model:

```ts
export type EmailAuthValues = {
  name: string;
  email: string;
  password: string;
};

export type EmailAuthFormProps = {
  variant: "LOGIN" | "REGISTER";
  returnPath: string;
  gateway: AuthGateway;
  onAuthenticated: () => void;
  onPasskeyEnrollment: () => void;
};
```

Render one form with name when registering, email, the email-link button, a semantic text separator, password, and the password-submit button. Register password without a global required rule; the password-submit handler calls `setError("password", { type: "required", message: "Password is required." })` before invoking the gateway. The email-link handler validates only name/email. Focus a `tabIndex={-1}` alert summary on invalid submit.

- [ ] **Step 4: Write failing top-level auth-form tests**

Create `app/(site)/components/auth-form.test.tsx` and assert:

- `Sign in with a passkey` is the first button when readiness is `ready`;
- no passkey prompt starts on mount;
- passkey success calls `markFocusAfterAuth()` and navigates to `returnPath`;
- passkey cancellation restores focus and announces the exact cancellation message;
- unavailable passkeys omit the button and render the readiness explanation;
- callback error `auth_link_invalid` renders a focused alert with `That sign-in link is invalid or expired.` and an `Email me a new link` path;
- toggling registration changes the password autocomplete purpose from `current-password` to `new-password`;
- an already signed-in user is redirected with `router.replace(returnPath)`, not `/users`.

- [ ] **Step 5: Run the top-level auth-form tests and confirm the red state**

Run:

```bash
npm test -- "app/(site)/components/auth-form.test.tsx"
```

Expected: FAIL because the current form uses direct Supabase calls, toast-only outcomes, `/users`, and inline enrollment.

- [ ] **Step 6: Refactor the auth orchestrator**

Change `AuthForm` to:

```ts
type AuthFormProps = {
  returnPath: string;
  callbackError?: "auth_link_invalid";
};
```

Remove direct Supabase calls, toast-only outcomes, and inline `offerEnrollment`. Create one `AuthGateway` instance. Use `beginAuthentication()` immediately before passkey or email/password gateway calls. On authenticated success call `markFocusAfterAuth()` then `router.replace(returnPath)` and `router.refresh()`. For registration enrollment, navigate to `buildPasskeyEnrollmentPath(returnPath)`.

On any gateway failure, call `returnToSignedOut(authFailureMessage(result.code))`; passkey cancellation additionally restores focus to the passkey button. A successful login email-link request calls `returnToSignedOut("Sign-in link sent. Check your email.")`. A successful registration email-link request, or password registration with `hasSession: false`, calls `returnToSignedOut("Check your email to finish creating your account.")`. Password registration with `hasSession: true` proceeds directly to optional passkey enrollment.

Render in this order: passkey action, readiness explanation when unavailable, `EmailAuthForm`, then the login/register toggle. Use fixed messages from the gateway and the shared announcement region.

While passkey readiness is `checking`, render only the heading and noninteractive `Checking passkey support…` status. Do not render email/password controls and then insert the passkey button above the user's current focus.

- [ ] **Step 7: Make the landing page parse safe query state**

Change `app/(site)/page.tsx` to an async page with this contract:

```tsx
type HomeProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const returnPath = sanitizeAuthReturnPath(params.next);
  const callbackError =
    params.error === "auth_link_invalid" ? "auth_link_invalid" : undefined;
  return <AuthForm returnPath={returnPath} callbackError={callbackError} />;
}
```

Keep the surrounding layout, change the logo alt to `Messenger`, and change the page heading to `<h1>Continue with your account</h1>`.

- [ ] **Step 8: Write failing post-auth focus tests**

Create `app/components/accessibility/focus-after-auth.test.tsx`:

```tsx
it("focuses the destination page title once", async () => {
  markFocusAfterAuth();
  const { rerender } = render(
    <>
      <FocusAfterAuth pathname="/conversations" />
      <h1 data-page-title tabIndex={-1}>Conversations</h1>
    </>
  );
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
  rerender(
    <>
      <FocusAfterAuth pathname="/users" />
      <h1 data-page-title tabIndex={-1}>People</h1>
    </>
  );
  expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
});
```

- [ ] **Step 9: Run the post-auth focus test and confirm the red state**

Run:

```bash
npm test -- app/components/accessibility/focus-after-auth.test.tsx
```

Expected: FAIL because the one-shot focus marker and observer do not exist.

- [ ] **Step 10: Implement one-shot focus restoration**

`app/libs/auth/focus-after-auth.ts` owns the session-storage key and exports `markFocusAfterAuth()` and `consumeFocusAfterAuth()`. Both functions return safely during server rendering or denied storage access.

`FocusAfterAuth` consumes the marker on pathname changes and focuses `[data-page-title]`, falling back to `#main-content`. Keep the effect component pure and put the Next navigation hook in a production wrapper, so tests need no router mock:

```tsx
type FocusAfterAuthProps = { pathname: string };

export const FocusAfterAuth = ({ pathname }: FocusAfterAuthProps) => {
  // effect below
  return null;
};

export const RouteFocusAfterAuth = () => (
  <FocusAfterAuth pathname={usePathname()} />
);
```

Mount `RouteFocusAfterAuth` inside the root WebMCP provider.

Use this effect in `FocusAfterAuth`:

```tsx
useEffect(() => {
  if (!consumeFocusAfterAuth()) return;
  const frame = requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(
      "[data-page-title], #main-content"
    );
    target?.focus();
  });
  return () => cancelAnimationFrame(frame);
}, [pathname]);
```

Add `id="main-content"` and `tabIndex={-1}` to the existing sidebar `<main>`. Add a visually hidden focusable `<h1 data-page-title>` to `/conversations` and `/users`. Change the active conversation name heading in `header.tsx` from `h3` to `h1 data-page-title tabIndex={-1}`.

- [ ] **Step 11: Run Task 7 verification**

Run:

```bash
npm test -- "app/(site)/components/email-auth-form.test.tsx" "app/(site)/components/auth-form.test.tsx" app/components/accessibility/focus-after-auth.test.tsx
npx tsc --noEmit
npm run build
```

Expected: auth behavior, error/focus, and destination-focus tests PASS; the application builds.

- [ ] **Step 12: Commit Task 7**

```bash
git add "app/(site)/components/email-auth-form.tsx" "app/(site)/components/email-auth-form.test.tsx" "app/(site)/components/auth-form.tsx" "app/(site)/components/auth-form.test.tsx" "app/(site)/page.tsx" app/libs/auth/focus-after-auth.ts app/components/accessibility/focus-after-auth.tsx app/components/accessibility/focus-after-auth.test.tsx app/layout.tsx app/components/sidebar/sidebar.tsx app/conversations/page.tsx app/users/page.tsx app/conversations/[conversationId]/components/header.tsx
git commit -m "feat: complete accessible passkey-first sign-in"
```

---

### Task 8: Browser, Security, and Assistive-Technology Verification

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore:9-10`
- Create: `playwright.config.ts`
- Create: `e2e/accessible-auth.spec.ts`
- Create: `scripts/check-passkey-config.mjs`
- Create: `docs/testing/accessible-auth-manual.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: the completed auth UI, `get_connection_status`, provider status UI, passkey environment variables
- Produces: `npm run test:e2e`, `npm run verify:passkey-config`, and the manual AT evidence checklist

- [ ] **Step 1: Install browser-test dependencies and browser runtime**

Run:

```bash
npm install --save-dev @playwright/test @axe-core/playwright --legacy-peer-deps
npx playwright install chromium
```

Expected: Playwright and axe-core are added to development dependencies; Chromium installs successfully.

- [ ] **Step 2: Add browser scripts, config, and ignored output**

Add scripts:

```json
"build": "npm run verify:passkey-config && next build",
"test:e2e": "playwright test",
"verify:passkey-config": "node scripts/check-passkey-config.mjs"
```

Create `playwright.config.ts` with `testDir: "./e2e"`, Chromium-only projects, and this shared browser/server configuration:

```ts
use: {
  baseURL: "http://localhost:3000",
  trace: "on-first-retry",
  screenshot: "only-on-failure",
},
webServer: {
  command: "npm run dev",
  url: "http://localhost:3000",
  reuseExistingServer: !process.env.CI,
}
```

Add `/playwright-report`, `/test-results`, and `/blob-report` to `.gitignore`.

- [ ] **Step 3: Create a fake browser WebMCP surface for E2E**

At the start of each WebMCP-aware Playwright test, call `page.addInitScript()` before navigation. The script defines `document.modelContext.registerTool()`, stores registered tools in `window.__webmcpTest.tools`, and removes each tool when its registration signal aborts. It must never bypass application authentication; it only emulates browser tool discovery.

Use this serializable shape:

```ts
type CapturedTool = {
  name: string;
  execute: (input: unknown, context: { signal: AbortSignal }) => Promise<string> | string;
};

type WebMCPTestSurface = {
  tools: CapturedTool[];
  abortCount: number;
};
```

Install the fake surface before navigation:

```ts
await page.addInitScript(() => {
  const surface: WebMCPTestSurface = { tools: [], abortCount: 0 };
  Object.defineProperty(window, "__webmcpTest", { value: surface });
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      async registerTool(
        tool: CapturedTool,
        options?: { signal?: AbortSignal }
      ) {
        surface.tools.push(tool);
        options?.signal?.addEventListener(
          "abort",
          () => {
            surface.tools = surface.tools.filter((candidate) => candidate !== tool);
            surface.abortCount += 1;
          },
          { once: true }
        );
      },
    },
  });
});
```

- [ ] **Step 4: Write browser accessibility and lifecycle tests**

Create `e2e/accessible-auth.spec.ts` with these tests:

1. Signed-out page has one `h1`, first button `Sign in with a passkey` when supported, email-link and password fallbacks, visible focus, and no serious/critical axe violations.
2. Public `get_connection_status` returns `authenticated: false`, `state: "SIGNED_OUT"`, and no identity/token fields.
3. Password sign-in using `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` reaches `/conversations`, focuses the Conversations heading, announces `Signed in. Messenger connected.`, and changes the status tool to `authenticated: true`.
4. Logout aborts the authenticated registration before the public status tool becomes active again.
5. With no fake `document.modelContext`, password sign-in announces the degraded-browser message and the ordinary Conversations page remains operable.
6. The protected passkey-enrollment page exposes `Set up passkey` and `Maybe later` with keyboard focus; skip returns to the validated destination.

Read E2E credentials from process environment and throw this exact startup error when missing:

```text
E2E_USER_EMAIL and E2E_USER_PASSWORD must identify a disposable Supabase test account.
```

Do not add those values to source control or browser-visible environment variables.

- [ ] **Step 5: Add the automated production passkey configuration check**

Create `scripts/check-passkey-config.mjs`. It must:

- use `http://localhost:3000` and `localhost` only when both public variables are missing and `CI` is not `true`;
- fail when either value is missing in CI;
- fail when `new URL(NEXT_PUBLIC_APP_ORIGIN).hostname !== NEXT_PUBLIC_PASSKEY_RP_ID`;
- fail for non-HTTPS origins except `localhost`;
- fail for `localhost` when `CI=true`;
- print only the validated origin and RP ID, never Supabase credentials.

Use exit code 1 for failure and these exact messages: `Missing passkey origin configuration.`, `Passkey RP ID does not match the app origin.`, and `Production passkeys require a non-local HTTPS origin.`.

Use this complete script:

```js
const isCi = process.env.CI === "true";
const originValue =
  process.env.NEXT_PUBLIC_APP_ORIGIN ??
  (isCi ? "" : "http://localhost:3000");
const rpId =
  process.env.NEXT_PUBLIC_PASSKEY_RP_ID ?? (isCi ? "" : "localhost");

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!originValue || !rpId) {
  fail("Missing passkey origin configuration.");
}

let origin;
try {
  origin = new URL(originValue);
} catch {
  fail("Missing passkey origin configuration.");
}

if (origin.hostname !== rpId) {
  fail("Passkey RP ID does not match the app origin.");
}

const localHttp = origin.protocol === "http:" && origin.hostname === "localhost";
if (origin.protocol !== "https:" && !localHttp) {
  fail("Production passkeys require a non-local HTTPS origin.");
}
if (isCi && origin.hostname === "localhost") {
  fail("Production passkeys require a non-local HTTPS origin.");
}

console.log(`Passkey origin verified: ${origin.origin} (${rpId})`);
```

- [ ] **Step 6: Write the manual assistive-technology checklist**

Create `docs/testing/accessible-auth-manual.md` with dated evidence tables for:

- Chrome + NVDA on Windows;
- Chrome + JAWS on Windows;
- Safari + VoiceOver on macOS;
- ChatGPT desktop built-in browser;
- keyboard-only operation;
- real production-host passkey enrollment, sign-in, cancellation, and deletion;
- email-link creation and expired-link recovery;
- confirmation that production Supabase email confirmation is enabled;
- session expiry during a mocked read and write, verifying no write replay;
- WebMCP unavailable and registration-failure recovery.

Each row records tester, date, browser/AT version, result, and issue link. State that automated tests cannot replace a real operating-system passkey prompt or assistive-technology verification.

- [ ] **Step 7: Update README commands and security model**

Add concise sections documenting:

- passkey, email-link, and password methods;
- why users authenticate directly on the page;
- automatic session-bound WebMCP registration;
- separate browser session behavior in ChatGPT desktop;
- `npm test`, `npm run test:e2e`, and `npm run verify:passkey-config`;
- disposable E2E credential requirements;
- production RP ID and email-confirmation gates.

Remove README statements that say NextAuth/GitHub/Google own the current auth flow.

- [ ] **Step 8: Run the full automated verification**

Run:

```bash
npm test
npm run test:e2e
npm run verify:passkey-config
npm run lint
npm run build
git diff --check
```

Expected: all unit/component and browser tests PASS, passkey configuration validates, lint and build succeed, and the diff has no whitespace errors.

- [ ] **Step 9: Complete manual verification or record the external gate**

Run the checklist on every available browser/assistive-technology pair. A missing operating system, ChatGPT site-tools entitlement, final production hostname, or human tester is recorded as an explicit release gate in the checklist; it is not reported as passed.

- [ ] **Step 10: Commit Task 8**

```bash
git add package.json package-lock.json .gitignore playwright.config.ts e2e/accessible-auth.spec.ts scripts/check-passkey-config.mjs docs/testing/accessible-auth-manual.md README.md
git commit -m "test: verify accessible session-bound authentication"
```

---

## Specification Coverage Map

| Design acceptance criterion | Planned proof |
|---|---|
| 1. Returning user reaches Conversations with a passkey and no typed identifier | Task 7 passkey-first `AuthForm` test; Task 8 browser sign-in checklist |
| 2. New/recovering user can use a clickable email link | Task 5 gateway redirect-boundary test; Task 7 email-form tests; Task 8 real email-link checklist |
| 3. Passkey cancellation restores focus and announces a nonfatal result | Task 6 `PasskeyEnrollment` test and Task 7 `AuthForm` cancellation test |
| 4. Only validated internal destinations are restored, defaulting to Conversations | Task 1 return-path and callback tests; Task 7 post-auth focus test |
| 5. WebMCP connects automatically without a second user action | Task 4 provider lifecycle test; Task 8 signed-in browser test |
| 6. Authenticated tools exist only for the current server-validated user and abort on logout/switch | Task 4 lifecycle test with the test-only `test_authenticated_messenger_action`; Task 8 logout test |
| 7. Same-user refresh does not duplicate tools or announcements | Task 4 same-user rerender test |
| 8. An expired write is neither sent twice nor replayed | Task 3 one-request `AUTH_REQUIRED` test; Task 8 read/write expiry checklist |
| 9. No credential or session secret crosses the tool boundary | Task 2 status result test; Task 3 API-client contract; Task 8 final secret search |
| 10. Keyboard, axe, NVDA, JAWS, and VoiceOver coverage | Tasks 5–7 component tests; Task 8 axe browser test and dated manual matrix |
| 11. Production passkeys remain gated on the final origin/RP ID | Task 6 readiness tests; Task 8 build-time configuration script and real-host checklist |
| 12. Ordinary Messenger remains usable without WebMCP | Task 4 unavailable-browser test; Task 8 degraded-browser test |

The test-only Messenger action is injected through the provider's registry prop and never added to `defaultToolRegistry`. The production tool catalog, Realtime voice, media analysis, and unfinished Supabase transport migration therefore remain outside this plan.

## Final Review Gate

Before declaring the feature complete:

1. Compare every acceptance criterion in the design spec with a named automated test or manual checklist row.
2. Inspect `document.modelContext` registrations while signed out, signed in, switched to another account, expired, and signed out again.
3. Search `app/webmcp` and captured tool/activity output for `access_token`, `refresh_token`, `service_role`, `password`, and Supabase session objects; confirm none appear in WebMCP schemas, results, or activity output. Password fields are allowed only in the visible webpage auth form and its browser test selectors.
4. Confirm the full Messenger tool catalog, Realtime voice, media analysis, and unfinished Supabase transport files remain outside the diff.
5. Run `git status --short` and ensure only intentional changes remain.
