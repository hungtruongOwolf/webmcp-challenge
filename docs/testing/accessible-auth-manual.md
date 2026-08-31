# Accessible authentication manual verification

Evidence date: 2026-08-30

Automated Playwright, axe, and component tests cannot replace a real operating-system passkey prompt or human assistive-technology verification. Every row below needs named, dated evidence before release. `RELEASE GATE` means the required environment, entitlement, production configuration, or human tester was unavailable; it does not mean the check passed.

## Browser and assistive-technology matrix

| Scenario | Tester | Date | Browser / AT version | Result | Issue link |
| --- | --- | --- | --- | --- | --- |
| Chrome + NVDA on Windows: complete passkey, email-link, and password flows; verify focus order and announcements | Unassigned | 2026-08-30 | Not available | **RELEASE GATE — no human NVDA evidence** | TBD |
| Chrome + JAWS on Windows: complete passkey, email-link, and password flows; verify focus order and announcements | Unassigned | 2026-08-30 | Not available | **RELEASE GATE — no human JAWS evidence** | TBD |
| Safari + VoiceOver on macOS: complete passkey, email-link, and password flows; verify focus order and announcements | Unassigned | 2026-08-30 | Not available | **RELEASE GATE — no macOS / VoiceOver human evidence** | TBD |
| ChatGPT desktop built-in browser: discover the public status tool, authenticate on the page, then discover session-bound tools | Unassigned | 2026-08-30 | Entitlement/version not available | **RELEASE GATE — no ChatGPT site-tools entitlement evidence** | TBD |
| Keyboard only: complete every auth method, cancel passkey, skip enrollment, log out, and confirm visible focus throughout | Unassigned | 2026-08-30 | Browser/version not recorded | **RELEASE GATE — human keyboard run not completed** | TBD |

## Authentication and production configuration matrix

| Scenario | Tester | Date | Browser / AT version | Result | Issue link |
| --- | --- | --- | --- | --- | --- |
| Production-host passkey enrollment succeeds through the real operating-system prompt | Unassigned | 2026-08-30 | Production host not assigned | **RELEASE GATE — final HTTPS hostname and RP ID unavailable** | TBD |
| Returning-user passkey sign-in reaches Conversations without a typed identifier | Unassigned | 2026-08-30 | Production host not assigned | **RELEASE GATE — final HTTPS hostname and disposable account unavailable** | TBD |
| Cancelling the real passkey prompt restores focus and announces a nonfatal result | Unassigned | 2026-08-30 | Production host not assigned | **RELEASE GATE — real OS passkey prompt not tested** | TBD |
| Deleting a passkey in settings removes it and leaves another sign-in method available | Unassigned | 2026-08-30 | Production host not assigned | **RELEASE GATE — real credential and production host unavailable** | TBD |
| Email-link account creation completes and returns only to a validated internal destination | Unassigned | 2026-08-30 | Disposable inbox/account unavailable | **RELEASE GATE — disposable email account unavailable** | TBD |
| Expired email link focuses the recovery alert and a replacement link can be requested | Unassigned | 2026-08-30 | Disposable inbox/account unavailable | **RELEASE GATE — real expired-link flow not tested** | TBD |
| Production Supabase email confirmation is enabled and required for new email/password accounts | Unassigned | 2026-08-30 | Supabase production project unavailable | **RELEASE GATE — dashboard setting has no production evidence** | TBD |

## Session-bound WebMCP matrix

| Scenario | Tester | Date | Browser / AT version | Result | Issue link |
| --- | --- | --- | --- | --- | --- |
| Session expires during a mocked read: tools abort, the expiry announcement is made, and sign-in is offered | Unassigned | 2026-08-30 | Manual harness not run | **RELEASE GATE — manual expiry evidence unavailable** | TBD |
| Session expires during a mocked write: exactly one request is observed and the write is never replayed after re-authentication | Unassigned | 2026-08-30 | Manual harness not run | **RELEASE GATE — manual no-replay evidence unavailable** | TBD |
| WebMCP API unavailable: degraded-browser announcement is made and ordinary Conversations remains operable | Unassigned | 2026-08-30 | Human browser run not completed | **RELEASE GATE — manual degraded-browser evidence unavailable** | TBD |
| WebMCP registration rejects: failure is announced, Retry agent connection succeeds, and no duplicate tools remain | Unassigned | 2026-08-30 | Human browser run not completed | **RELEASE GATE — manual registration-failure evidence unavailable** | TBD |

## Evidence instructions

For each completed row, replace the release-gate result with `PASS` or `FAIL`, record the tester, exact date, browser and assistive-technology versions, and link the issue or evidence artifact. A failed row blocks release until its issue is resolved and the row is rerun.
