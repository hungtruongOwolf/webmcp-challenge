# Accessible Authentication and Session-Bound WebMCP Design

**Status:** Approved in chat on 2026-08-30; awaiting review of this written specification.

## Goal

Let a blind user authenticate to this repository's Messenger clone with one
intentional passkey action, then make the page's Messenger WebMCP tools
available automatically under the same authenticated Supabase session. The
user must never have to give an agent a password, one-time code, passkey,
cookie, or access token, and must not face a second application-owned
"connect" step after signing in.

The intended journey is:

```text
Open app
  -> activate "Sign in with a passkey"
  -> complete the operating-system passkey prompt
  -> arrive in Conversations
  -> hear "Signed in. Messenger connected."
  -> use keyboard, site tools, or the later voice experience
```

"Messenger" in this specification means the messaging application in this
repository. It does not mean Facebook Messenger, WhatsApp, or another external
messaging service.

## Scope

This feature owns:

- the accessible sign-in, account bootstrap, and recovery experience;
- passkey-first authentication with email-link and password fallbacks;
- safe post-authentication redirects into the requested conversation;
- a single, announced authentication-and-tool connection state;
- top-level registration and removal of public and authenticated WebMCP tools;
- the boundary that makes authenticated WebMCP tools use the current Supabase
  session and existing row-level security;
- logout, user-switch, token-refresh, and session-expiry behavior;
- automated and assistive-technology verification of that boundary.

This feature does not own:

- Facebook Messenger or any other external account integration;
- the complete Messenger WebMCP tool catalog;
- the OpenAI Realtime voice session or speech interface;
- media description, catch-up summarization, or prompt-injection quarantine;
- completing the existing Prisma/Pusher to Supabase data and realtime
  migration.

Those systems consume this feature's authenticated tool boundary. The existing
Supabase migration must be completed before the end-to-end "send a message"
acceptance test can pass, but it is tracked by `SUPABASE-MIGRATION.md` rather
than duplicated here.

## Current State

The repository already has the right identity foundation:

- Supabase Auth owns identity and server-side session validation.
- The sign-in page leads with a discoverable passkey and retains email and
  password fields.
- `CurrentUserProvider` is seeded from the server and follows Supabase auth
  state changes in the browser.
- middleware refreshes the session cookie and protects `/users` and
  `/conversations`.
- passkeys can be enrolled and revoked in account settings.
- database row-level security restricts conversation and message data to
  conversation members.

The current gaps are:

- successful authentication always enters `/users` instead of restoring a
  requested Messenger location;
- sign-in state and errors are communicated primarily through visual toasts;
- form fields do not expose complete invalid, required, autocomplete, and
  associated-error semantics;
- email-link bootstrap and recovery are not exposed even though an auth
  callback route exists;
- the production WebAuthn relying-party domain has not been selected;
- no WebMCP tool is registered and there is no authentication-aware tool
  lifecycle;
- the message send and realtime paths are still in the documented Supabase
  migration's incomplete phases;
- the repository has no automated accessibility or end-to-end test setup.

## Chosen Approach

Use session-bound WebMCP with passkey-first authentication.

The web page, not the agent, authenticates the user. After Supabase verifies the
user, a top-level client provider registers authenticated Messenger tools. Tool
implementations call same-origin application routes, and those routes create a
Supabase server client from the page's existing session cookie. The database's
row-level security remains the final authorization boundary.

There is no application-owned OAuth-style connection grant between WebMCP and
Messenger. The browser or agent host may still display its own website-access
permission prompt; the application cannot and must not bypass that prompt.

### Alternatives Not Chosen

**OAuth-provider-first authentication** adds redirects, provider-specific
screen-reader behavior, and another account dependency without improving the
repository's existing Supabase identity boundary. A social provider can be
added later as another fallback, but it is not necessary for this feature.

**Agent-mediated credentials or one-time connection tokens** reduce visible UI
steps by moving secrets into the least trustworthy boundary. This approach is
rejected: agents never receive authentication credentials or bearer tokens.

**A separate "Connect WebMCP" button** would create a second mental model and a
second failure point. It is rejected: authenticated tools appear automatically
when the current page session becomes ready.

## User Experience

### Signed-Out Landing Page

The page has one clear heading and the following semantic order:

1. `Sign in with a passkey`, the primary action.
2. `Email me a sign-in link`, the passwordless bootstrap and recovery action.
3. `Use email and password instead`, the persistent fallback.
4. `Create an account`, which uses an emailed link to confirm the account
   before offering passkey enrollment.

The page does not automatically open a passkey or microphone prompt. The user
initiates each operating-system permission surface deliberately.

The passkey control is the first actionable control in the main content. It has
a stable accessible name, visible focus, and an adjacent explanation that the
operating system may offer a fingerprint, face, device PIN, password manager,
or hardware security key.

### Account Bootstrap and Recovery

Email-link authentication is the default account-creation and recovery path.
The user enters an email address once and receives a clickable link; the
application never requires manual transcription of a numeric code.

The callback exchanges the Supabase code for a session and accepts only an
internal return path. The default return path is `/conversations`. Accepted
return paths are `/users`, `/conversations`, and a valid
`/conversations/<uuid>` route. Any malformed, absolute, protocol-relative, or
unrecognized return path becomes `/conversations`.

After the first confirmed account session, supported devices receive an
optional passkey enrollment step. Skipping enrollment does not block entry to
Messenger, and the option remains available in Settings.

Password-based sign-in and registration remain available for existing users
and for environments where email-link delivery or WebAuthn is unavailable.
Fields permit paste and password-manager autofill. Password sign-in uses
`email` and `current-password` autocomplete purposes; password registration
uses `email` and `new-password`.

### Successful Sign-In

On success, the application restores the validated return path, refreshes the
server-rendered session, focuses the destination page's main heading, and
announces one concise status message:

```text
Signed in. Messenger connected.
```

If WebMCP is unavailable in the browser, the user is still signed in and hears:

```text
Signed in. Messenger is ready; agent tools are unavailable in this browser.
```

The ordinary Messenger interface remains fully usable in that degraded state.

### Cancellation and Failure

Closing the operating-system passkey prompt is a cancellation, not a fatal
error. Focus returns to the passkey button and a polite status says:

```text
Passkey sign-in cancelled. Choose another sign-in method when ready.
```

Validation errors appear next to their fields, are referenced through
`aria-describedby`, set `aria-invalid`, and are also summarized at the start of
the form. Submission failure focuses the summary; correcting a field does not
erase unrelated input.

Expired or invalid email links return to the sign-in page with an alert and an
`Email me a new link` action. Raw Supabase error strings are not presented to
users.

## Connection State Model

The application exposes one state machine for authentication and WebMCP
readiness:

```text
SIGNED_OUT
  -> AUTHENTICATING
  -> SESSION_READY
  -> TOOLS_REGISTERING
  -> CONNECTED
```

It also supports these nonterminal states:

- `SIGNED_IN_TOOLS_UNAVAILABLE`: the session is valid but the browser has no
  usable `document.modelContext`;
- `SIGNED_IN_TOOLS_FAILED`: tool registration failed and can be retried;
- `SESSION_EXPIRED`: the old tool set has been removed and reauthentication is
  required.

Only meaningful user-facing transitions are announced. Token refreshes for the
same user do not repeat "connected." All announcements use one persistent,
atomic polite status region. Blocking form and session errors use an alert
region.

## Component Boundaries

### Authentication Form

The authentication form owns method selection, field validation, invoking
Supabase Auth, and focus restoration after an operating-system prompt. It does
not register WebMCP tools or infer tool readiness.

The shared input component owns native `required`, autocomplete purpose,
invalid state, and the association between each field and its error message.

### Authentication Callback

The callback owns exchanging a Supabase code for a server session and
validating the internal return path. It does not render credentials, register
tools, or accept an external redirect destination.

### Current User Provider

The existing provider remains the source of browser-side authentication truth.
It exposes the current Supabase user and auth-state changes. A token refresh for
the same user preserves the tool lifecycle; sign-out or a different user ID
starts a new lifecycle.

### WebMCP Connection Provider

A new client provider lives in the top-level document inside
`CurrentUserProvider`. It owns:

- detecting `document.modelContext` support;
- maintaining the connection state machine;
- registering the signed-out public tool set;
- registering authenticated tools only after a current user exists;
- aborting the previous tool set before logout or user changes;
- preventing stale asynchronous registration from overwriting newer state;
- rendering the single screen-reader status region.

The provider uses one lifecycle generation number and one `AbortController` per
tool set. Every auth transition increments the generation. A registration
result changes visible state only when its captured generation is still
current.

### Tool Registry

The registry separates public and authenticated scopes.

The only public tool in this feature is `get_connection_status`. While signed
out it returns a small, non-sensitive result indicating that direct website
sign-in is required. It never accepts credentials and never starts a passkey
ceremony.

Authenticated Messenger tools are supplied by the Messenger tool catalog. The
connection provider gives them only an abort signal and same-origin API client;
it does not give them a raw Supabase session, cookie, refresh token, or bearer
token.

Authenticated `get_connection_status` returns connection readiness and the
current application route. It does not return an email address, user ID,
session expiry, or token metadata.

`get_connection_status` is the one required authenticated tool in this
feature. The provider may also receive Messenger tools from the later catalog.
`CONNECTED` means that the authenticated status tool and every tool supplied to
the provider for the current page have registered successfully. This makes the
connection boundary testable before the full catalog exists without claiming
that unimplemented messaging capabilities are available.

### Same-Origin API Boundary

Authenticated tools call the application's `/api/*` routes. Each route creates
the existing Supabase server client from request cookies and lets row-level
security authorize reads and writes. Tool input cannot select or override the
acting user ID.

The browser client never uses a Supabase service-role key. No tool argument,
tool output, activity record, console message, or analytics event contains a
session cookie or access/refresh token.

## Tool Lifecycle

### Initial Load

The server layout validates the Supabase user before first paint. The browser
provider receives that initial value, so a signed-in page can begin registering
authenticated tools without flashing a signed-out state.

### Sign-In

After Supabase emits a signed-in session, the provider removes the public tool
set, registers the authenticated set in the top-level document, and becomes
`CONNECTED` only after the authenticated status tool and every currently
supplied Messenger tool have registered.

### Refresh

A token refresh for the same user does not tear down tools. Subsequent
same-origin route calls naturally use the refreshed cookie.

### Sign-Out or User Switch

The provider aborts the authenticated tool controller before rendering the
signed-out state. A user switch cannot reuse the previous user's in-flight
result. After aborting, the provider registers only the public status tool.

### Session Expiry During a Tool Call

An API route returns a typed `AUTH_REQUIRED` failure. Read operations stop and
request reauthentication. Write operations stop without retrying or replaying.
Any unsent application draft remains visible for the user, but the agent must
request fresh confirmation after the new session is connected.

## Security Rules

1. Authentication secrets are entered or approved only in the webpage and
   operating-system authentication surface.
2. WebMCP tool schemas never contain password, passkey, one-time-code, cookie,
   access-token, refresh-token, or service-key fields.
3. Messaging tools are absent until server-validated user state exists.
4. Tool handlers cannot accept an acting user ID; identity comes only from the
   request session.
5. Supabase row-level security remains mandatory for every conversation and
   message query.
6. Sign-out, user switch, or expiry aborts the previous authenticated tool set
   before another set can register.
7. A write interrupted by authentication failure is never replayed
   automatically.
8. Sensitive Messenger writes retain their separate draft-and-confirm design;
   authentication does not count as consent to send.
9. Activity UI and logs redact credentials, token metadata, and complete message
   bodies by default.
10. Production email confirmation is enabled. Development may disable it only
    in the local Supabase configuration.

## Production Domain Gate

Supabase passkeys are tied to the configured WebAuthn relying-party ID. Local
development may use `localhost`. Before a public deployment permits passkey
enrollment, all of the following must be true:

- the final HTTPS hostname is selected;
- `NEXT_PUBLIC_APP_ORIGIN` contains the exact public HTTPS origin;
- `NEXT_PUBLIC_PASSKEY_RP_ID` contains only that origin's hostname;
- the Supabase Passkeys relying-party ID exactly matches that hostname;
- the relying-party origin exactly matches the public HTTPS origin;
- an automated deployment check parses `NEXT_PUBLIC_APP_ORIGIN` and asserts
  that its hostname equals `NEXT_PUBLIC_PASSKEY_RP_ID`;
- a real passkey is enrolled and used successfully on the production host.

If those checks do not pass, production displays email-link and password
methods and disables new passkey enrollment with an accessible explanation.
Existing production passkeys are never silently invalidated by a hostname
change.

## Accessibility Requirements

The conformance target is WCAG 2.2 AA for this complete process, including
errors, recovery, operating-system-prompt return, and session expiry.

- Every control uses native interactive semantics or a fully equivalent
  accessible name, role, value, and keyboard behavior.
- Every interactive control has visible focus and remains unobscured.
- The flow works with Tab, Shift+Tab, Enter, Space where native, and Escape for
  dismissible application dialogs.
- No auth step requires visual object recognition, memory-only credentials,
  manual code transcription, drag, hover, or pointer precision.
- Password and verification fields permit paste and autofill.
- Loading, success, cancellation, degraded connection, and expiry are announced
  once without moving focus unnecessarily.
- Focus returns to the invoking control after cancellation and moves to a
  useful destination heading after success.
- Tool connection status is available as visible text, screen-reader status,
  and the `get_connection_status` tool.
- Authentication never depends on microphone access. The later voice feature is
  an enhancement, not the only usable path.

## Failure and Recovery Matrix

| Condition | User-visible result | Tool result |
|---|---|---|
| WebAuthn unsupported | Passkey action is omitted; email link is primary | Public status remains available |
| Passkey prompt cancelled | Focus returns; polite cancellation status | No auth state change |
| No matching passkey | Explain and offer email link/password | No auth state change |
| Email link expired | Alert plus one-action resend | No authenticated tools |
| Session valid, WebMCP absent | Messenger remains usable; degraded status | No site tools |
| Tool registration fails | Signed-in status plus retry action | No partial connected claim |
| Session expires during read | Reauthentication required | `AUTH_REQUIRED` |
| Session expires during write | Draft preserved; fresh confirmation required | `AUTH_REQUIRED`, no retry |
| User signs out | Signed-out page announced | Authenticated tools aborted |
| User changes accounts | New lifecycle starts after old aborts | No previous-user result accepted |

## Verification Strategy

### Deterministic Tests

- Unit-test return-path validation against valid conversation UUID paths,
  absolute URLs, protocol-relative URLs, malformed encodings, and unknown
  routes.
- Unit-test every connection-state transition, including stale registration
  completion after sign-out or user switch.
- Component-test field labels, autocomplete purposes, native required state,
  invalid state, associated error messages, summary focus, status messages, and
  passkey-button focus restoration.
- Mock WebAuthn success, cancellation, unsupported, missing-credential, and
  verification-failure outcomes.
- Mock `document.modelContext` and assert public-versus-authenticated tool sets,
  top-level registration, abort order, no duplicate registration on token
  refresh, and recovery after registration failure.
- Assert that tool schemas, outputs, logs, and activity events contain no auth
  secrets or token metadata.

### Integration Tests

- Use two Supabase test users and assert that each can read only conversations
  they belong to through the same API paths used by tools.
- Expire a session during a read and a write; assert `AUTH_REQUIRED`, no write
  replay, and no acceptance of the old lifecycle's result.
- Sign in, sign out, and switch users while tool registration is delayed; assert
  that only the final user's tools remain.
- Complete email-link callback tests with accepted and rejected return paths.

### Browser and Assistive-Technology Tests

- Add Playwright and axe coverage for the signed-out page, passkey enrollment
  offer, authenticated connection state, failure states, and logout.
- Complete the entire flow using only the keyboard.
- Manually verify Chrome with NVDA and JAWS on Windows, and Safari with
  VoiceOver on macOS.
- Verify the ChatGPT desktop built-in browser separately because it has its own
  browser session and permission surface.
- Verify that browser or microphone limitations do not block normal sign-in and
  Messenger use.

## Acceptance Criteria

1. A returning user with an enrolled passkey can reach Conversations without
   typing an email or password.
2. A new or recovering user can authenticate through a clickable email link
   without manually transcribing a code.
3. Passkey cancellation restores focus and announces a nonfatal outcome.
4. Successful authentication restores only a validated internal destination
   and defaults to `/conversations`.
5. The application adds no separate WebMCP connection action after sign-in.
6. The authenticated status tool and every Messenger tool supplied to the
   provider exist only while a server-validated user is current, and they are
   aborted before sign-out or user switch completes.
7. A token refresh for the same user does not duplicate tools or announcements.
8. Session expiry during a write cannot send or automatically replay that
   write.
9. No credential or session secret appears in a tool schema, call, result,
   visible activity record, console message, or analytics event.
10. The auth and connection flow is keyboard complete, has no critical axe
    violations, and passes the specified NVDA, JAWS, and VoiceOver checks.
11. Production passkey enrollment remains disabled until the final hostname and
    Supabase relying-party configuration pass the production domain gate.
12. When WebMCP is unavailable, the user can still authenticate and use the
    ordinary Messenger UI with an announced degraded state.

## Delivery Boundary

The implementation plan for this specification may modify the authentication
form, shared input semantics, auth callback, current-user context interface,
root layout composition, and new focused WebMCP connection/registry modules. It
must not absorb the full Messenger tool catalog, Realtime voice implementation,
media analysis, or the remaining data/realtime migration.

End-to-end message-send verification depends on the existing Supabase migration
being completed first. The auth-and-connection feature itself is complete when
it can prove session-bound registration with the authenticated status tool and
one test Messenger tool under all lifecycle and accessibility conditions
defined above. That test tool exists only in automated tests and is not shipped
as a user-facing messaging capability.

## Primary References

- [OpenAI: Using site tools in the ChatGPT desktop app](https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app)
- [Chrome: WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome: WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [Supabase: Passkey authentication](https://supabase.com/docs/guides/auth/passkeys)
- [W3C: Understanding Accessible Authentication (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)
