# Accessible auth/WebMCP final fix report

Date: 2026-08-30

Branch: `feature/accessible-auth-webmcp`

## Outcome

The seven findings in `final-branch-review.md` are addressed as one scoped
fix. The full Messenger catalog, realtime/media work, transport migration,
secrets, production test hooks, and auth bypasses remain outside the change.

## RED evidence

Production change that each test was written to catch:

1. An authenticated server render starts from `SIGNED_OUT`, exposing and
   announcing signed-out copy before hydration effects run.
2. Session expiry followed by a null current user leaves no public
   `get_connection_status` registration and therefore no exact privacy-safe
   `SESSION_EXPIRED` payload.
3. Password, email-link, passkey sign-in, and passkey enrollment gateway
   failures expose only the polite status instead of a focused blocking alert.
4. A successful callback has no server-to-client one-shot focus marker, and
   enrollment success/skip navigation is not armed for destination focus.
5. The callback-to-enrollment page has no valid destination-heading focus
   target.
6. The passkey action has no associated adjacent method explanation.

Focused RED command (the first sandboxed attempt was blocked by Vite helper
`spawn EPERM`; the same command was rerun outside the sandbox):

```text
npm test -- app/webmcp/connection-provider.test.tsx app/auth/callback/route.test.ts app/components/accessibility/focus-after-auth.test.tsx app/components/auth/passkey-enrollment.test.tsx app/(site)/components/auth-form.test.tsx app/(site)/components/email-auth-form.test.tsx
```

Observed RED: exit 1; 6 test files failed; 12 intended tests failed and 37
neighboring tests passed. Failures were the missing authenticated SSR state,
missing expiry public registration, missing accessible description, missing
focused alerts, missing callback cookie, missing cookie consumption, and
missing enrollment focus markers.

Additional callback-to-enrollment RED:

```text
npm test -- app/auth/passkey/page.test.tsx
```

Observed RED: exit 1; expected `data-page-title` was absent from the `Add a
passkey?` heading.

## GREEN evidence

Focused GREEN after minimal implementation:

```text
npm test -- app/webmcp/connection-provider.test.tsx app/auth/callback/route.test.ts app/components/accessibility/focus-after-auth.test.tsx app/components/auth/passkey-enrollment.test.tsx app/(site)/components/auth-form.test.tsx app/(site)/components/email-auth-form.test.tsx
```

Result: exit 0; 6 files passed; 49 tests passed.

Callback-to-enrollment GREEN:

```text
npm test -- app/auth/passkey/page.test.tsx
```

Result: exit 0; 1 file passed; 1 test passed.

The initial GREEN attempt exposed that the lifecycle registry's public test
tool returned a stub `{ ok: true }` payload. The test double was corrected to
execute the provider's real live snapshot contract; no production behavior
was changed to satisfy the stub.

## Files changed

- `app/webmcp/connection-provider.tsx` and test: authenticated initial state,
  SSR/hydration regression, and expired-session public tool lifecycle/payload.
- `app/(site)/components/email-auth-form.tsx` and test: normalized email-link
  and password operation alerts with focus.
- `app/(site)/components/auth-form.tsx` and test: passkey failure alert/focus,
  cancellation distinction, and described passkey method.
- `app/components/auth/passkey-enrollment.tsx` and test: enrollment failure
  alert/focus and focus arming before success/skip navigation.
- `app/auth/callback/route.ts` and test: short-lived, fixed-value, same-site,
  secure-on-HTTPS one-shot focus handoff on successful sanitized redirects.
- `app/libs/auth/focus-after-auth.ts` and accessibility tests: consume and
  delete either the existing session marker or the server callback marker.
- `app/auth/passkey/page.tsx` and new test: callback-to-enrollment heading
  focus target.
- `e2e/accessible-auth.spec.ts`: shared axe helper and scans at signed-out,
  induced validation failure, authenticated, logout, degraded, and enrollment
  boundaries while retaining the faithful discovery fake and credential gate.
- `README.md`: `npm install --legacy-peer-deps`.

## Final verification

Fresh commands run after the final production change:

| Command | Result |
|---|---|
| `npm test` | PASS: 16 files, 115 tests |
| `npx tsc --noEmit` | PASS: exit 0 |
| `npm run lint` | PASS: no ESLint warnings or errors; Next.js prints its existing deprecation notice |
| `npm run verify:passkey-config` | PASS: local `http://localhost:3000` / `localhost` pair |
| Playwright `--list` with invalid non-secret process-local placeholders | PASS: exactly 6 Chromium tests discovered |
| `npm run test:e2e` without credentials | EXPECTED GATE: immediate exact disposable-credential error |
| `npm run build` | EXTERNAL GATE: passkey check passed, Next.js compiled successfully and checked types, then page-data collection failed for `/api/messages` because Pusher has no cluster |
| `git diff --check` | PASS: no whitespace errors |

The first sandboxed build attempt stopped at `spawn EPERM`; the approved
outside-sandbox rerun reached the known Pusher gate above. Vitest continues to
print the recorded Vite CommonJS/ESM future-compatibility warning.

## Seven-finding self-review

1. The reducer, message, and snapshot are seeded from the current
   server-validated user. Server HTML starts at `SESSION_READY`; hydration
   reaches connected/unavailable without rendering signed-out copy.
2. Expiry still aborts the authenticated controller, preserves
   `SESSION_EXPIRED`, the authenticated lock, and no-replay behavior. When the
   user becomes null, a fresh controller registers only public status. Its
   exact payload is `{ authenticated: false, state: "SESSION_EXPIRED", route,
   nextAction: "sign_in_on_page" }`.
3. Email-link and password operations share one focused summary; passkey
   sign-in and enrollment have their own focused summaries. All messages come
   from `authFailureMessage`. Cancellation creates no alert, stays polite, and
   restores the invoking button's focus. The shared submission lock is intact.
4. Successful callbacks set only a fixed, one-minute focus marker; no return
   URL is stored or replayed. The marker is SameSite Lax, Secure on HTTPS, and
   deleted on consumption. Enrollment success and skip arm the existing
   session marker before sanitized navigation, and the enrollment heading is a
   focus target.
5. Axe now runs through a shared helper at all required browser state
   boundaries. No auth bypass, production hook, secret, or altered WebMCP fake
   was added.
6. The passkey explanation is adjacent and associated with
   `aria-describedby`, covering fingerprint, face, device PIN, password
   manager, and hardware security key.
7. README now matches the required legacy-peer dependency install command.

Mutation check: changing authenticated initial state back to signed out,
skipping public registration on expiry, returning the wrong expiry payload,
removing any operation alert/focus, removing either focus marker, removing the
enrollment heading target, or removing `aria-describedby` fails a named test.

## Remaining external gates

- Real authenticated E2E execution needs disposable Supabase credentials and
  normal project configuration; it was not run and is not claimed passed.
- The full build remains gated after successful compilation/type checking by
  the pre-existing missing Pusher cluster.
- Final production hostname/RP-ID configuration, production email
  confirmation, real passkey and email-link journeys, ChatGPT desktop site-tool
  entitlement, and human NVDA/JAWS/VoiceOver evidence remain unavailable and
  are not claimed passed.
- The recorded Vite config-loader warning and six high-severity npm audit
  findings remain external/unrelated evidence gates.

## Residual correction

The scoped re-review found that blocking authentication failures were present
both in the focused alert and the polite global status, while AuthForm and
EmailAuthForm owned independent operation-error state. That split ownership
also allowed one method's stale alert to survive activation of another method.

### Residual RED evidence

The first residual RED run was:

```text
npm test -- app/(site)/components/auth-form.test.tsx app/(site)/components/email-auth-form.test.tsx app/components/auth/passkey-enrollment.test.tsx
```

Result: exit 1; 3 files failed; 6 intended tests failed and 26 neighboring
tests passed. Password, email-link, passkey sign-in, and enrollment error text
each appeared twice where covered; passkey-failure to email-link activation and
email-link-failure to passkey activation each left a stale alert.

Mutation review then removed the password-activation and mode-switch clears
before adding their tests. The second RED command was:

```text
npm test -- app/(site)/components/auth-form.test.tsx
```

Result: exit 1; the two new tests failed because password activation and
login/register switching each retained the previous operation alert. Thirteen
neighboring AuthForm tests passed.

### Residual implementation

- AuthForm is now the single owner of sign-in operation errors.
- EmailAuthForm receives that shared value and renders the page's sole
  operation alert, so passkey and email/password paths cannot render separate
  blocking summaries.
- Passkey, email-link, password, and account-mode activation all clear the
  same shared error after respecting the existing submission lock.
- Blocking failures return the connection state to signed out with an empty
  polite message, then expose the fixed normalized text only through the
  focused `role="alert"`.
- Passkey cancellation still uses the fixed polite message and restores focus
  to the invoking button without creating an alert.
- Enrollment announces only cancellation through the polite region;
  non-cancellation failure uses only its focused alert.

### Residual GREEN and final verification

```text
npm test -- app/(site)/components/auth-form.test.tsx app/(site)/components/email-auth-form.test.tsx app/components/auth/passkey-enrollment.test.tsx
```

Result: PASS, 3 files and 34 tests.

Fresh final checks after the focus-effect refactor:

| Command | Result |
|---|---|
| `npm test` | PASS: 16 files, 119 tests |
| `npx tsc --noEmit` | PASS: exit 0 |
| `npm run lint` | PASS: no ESLint warnings or errors; existing Next.js deprecation notice remains |
| `npm run verify:passkey-config` | PASS: local origin/RP-ID pair |
| Playwright `--list` with invalid non-secret placeholders | PASS: exactly 6 Chromium tests discovered |
| `npm run test:e2e` without credentials | EXPECTED GATE: immediate exact disposable-credential error |
| `git diff --check` | PASS: no whitespace errors before staging |

### Residual self-review and mutation check

- Reintroducing a parent-local passkey alert or child-local email alert makes
  the cross-method tests observe stale or multiple alerts.
- Restoring the blocking message in `returnToSignedOut` makes the literal
  occurrence and polite-status assertions fail.
- Removing the clear from passkey, email-link, password, or mode-switch
  activation fails its named regression test.
- Moving enrollment's `announce(message)` back outside the cancellation branch
  fails the sole-announcement assertion.
- Cancellation still has one polite status message, no alert, and restored
  invoking-button focus.
- The shared busy lock, fixed copy, callback focus handoff, provider lifecycle,
  public privacy payload, safe destinations, axe coverage, and passkey
  description were not broadened or altered.
