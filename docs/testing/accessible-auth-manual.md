# Accessible authentication manual verification

Evidence date: 2026-08-30

Automated Playwright, axe, and component tests cannot replace a real operating-system passkey prompt or human assistive-technology verification. Every row below needs named, dated evidence before release. `RELEASE GATE` means the required environment, entitlement, production configuration, or human tester was unavailable; it does not mean the check passed.

## Browser and assistive-technology matrix

| Scenario | Tester | Date | Browser / AT version | Result | Issue link |
| --- | --- | --- | --- | --- | --- |
| Chrome + NVDA on Windows: complete passkey and password flows; verify focus order and announcements | Unassigned | 2026-08-30 | Not available | **RELEASE GATE -- no human NVDA evidence** | TBD |
| Chrome + JAWS on Windows: complete passkey and password flows; verify focus order and announcements | Unassigned | 2026-08-30 | Not available | **RELEASE GATE -- no human JAWS evidence** | TBD |
| Safari + VoiceOver on macOS: complete passkey and password flows; verify focus order and announcements | Unassigned | 2026-08-30 | Not available | **RELEASE GATE -- no macOS / VoiceOver human evidence** | TBD |
| ChatGPT desktop built-in browser: discover the public status tool, authenticate on the page, then discover session-bound tools | Unassigned | 2026-08-30 | Entitlement/version not available | **RELEASE GATE -- no ChatGPT site-tools entitlement evidence** | TBD |
| Keyboard only: complete every auth method, cancel passkey, skip enrollment, log out, and confirm visible focus throughout | Unassigned | 2026-08-30 | Browser/version not recorded | **RELEASE GATE -- human keyboard run not completed** | TBD |

## Authentication and production configuration matrix

| Scenario | Tester | Date | Browser / AT version | Result | Issue link |
| --- | --- | --- | --- | --- | --- |
| Production-host passkey enrollment succeeds through the real operating-system prompt | Unassigned | 2026-08-30 | Production host not assigned | **RELEASE GATE -- final HTTPS hostname and RP ID unavailable** | TBD |
| Returning-user passkey sign-in reaches Conversations without a typed identifier | Unassigned | 2026-08-30 | Production host not assigned | **RELEASE GATE -- final HTTPS hostname and disposable account unavailable** | TBD |
| Cancelling the real passkey prompt restores focus and announces a nonfatal result | Unassigned | 2026-08-30 | Production host not assigned | **RELEASE GATE -- real OS passkey prompt not tested** | TBD |
| Deleting a passkey in settings removes it and leaves another sign-in method available | Unassigned | 2026-08-30 | Production host not assigned | **RELEASE GATE -- real credential and production host unavailable** | TBD |
| Production Supabase email confirmation is enabled and required for new email/password accounts | Unassigned | 2026-08-30 | Supabase production project unavailable | **RELEASE GATE -- dashboard setting has no production evidence** | TBD |

## Session-bound WebMCP matrix

| Scenario | Tester | Date | Browser / AT version | Result | Issue link |
| --- | --- | --- | --- | --- | --- |
| Session expires during a mocked read: tools abort, the expiry announcement is made, and sign-in is offered | Unassigned | 2026-08-30 | Manual harness not run | **RELEASE GATE -- manual expiry evidence unavailable** | TBD |
| Session expires during a mocked write: exactly one request is observed and the write is never replayed after re-authentication | Unassigned | 2026-08-30 | Manual harness not run | **RELEASE GATE -- manual no-replay evidence unavailable** | TBD |
| WebMCP API unavailable: degraded-browser announcement is made and ordinary Conversations remains operable | Unassigned | 2026-08-30 | Human browser run not completed | **RELEASE GATE -- manual degraded-browser evidence unavailable** | TBD |
| WebMCP registration rejects: failure is announced, Retry agent connection succeeds, and no duplicate tools remain | Unassigned | 2026-08-30 | Human browser run not completed | **RELEASE GATE -- manual registration-failure evidence unavailable** | TBD |
| Already signed in and visiting `/`: the page shows Signed in as <name>, focus lands on that heading, Continue opens Conversations, and Sign out then creating a second account never lands in the first account's session | Unassigned | 2026-09-02 | Human browser run not completed | **RELEASE GATE -- manual signed-in panel evidence unavailable** | TBD |
| Tools stay registered across navigation: call `open_conversation`, then confirm the activity panel still lists 26 tools and a handle obtained before navigation still executes | Unassigned | 2026-09-02 | Human browser run not completed | **RELEASE GATE -- manual navigation evidence unavailable** | TBD |
| `sign_out` asks first: the first call describes what will happen and signs nothing out, the second call with `confirm: true` ends the session in this browser only, and a second device stays signed in | Unassigned | 2026-09-02 | Human browser run not completed | **RELEASE GATE -- manual sign-out evidence unavailable** | TBD |
| Cross-conversation moves preview first: call `forward_message` or `send_attachment` with a `message_id` from a different chat, confirm the first call names the source chat and moves nothing, then confirm the second call with `confirm: true` delivers it | Unassigned | 2026-09-02 | Human browser run not completed | **RELEASE GATE -- manual cross-conversation evidence unavailable** | TBD |
| `wait_for_new_messages` shares the sidebar channel: let a call time out, then send a message from a second account and confirm the sidebar still announces it for screen-reader users | Unassigned | 2026-09-02 | Human browser run not completed | **RELEASE GATE -- manual inbox-channel evidence unavailable** | TBD |
| Typed text survives realtime: type in the message box, receive a message from a second account, then press Send and confirm the typed text is sent | Unassigned | 2026-09-02 | Human browser run not completed | **RELEASE GATE -- manual uncontrolled-input evidence unavailable** | TBD |
| Migration trigger: after `npx supabase db push`, edit a message and confirm `edited_at` is set by the database, then try to clear `deleted_at` on a deleted row and confirm Postgres rejects it | Unassigned | 2026-09-02 | Supabase project not available | **RELEASE GATE -- manual trigger evidence unavailable** | TBD |

## Evidence instructions

For each completed row, replace the release-gate result with `PASS` or `FAIL`, record the tester, exact date, browser and assistive-technology versions, and link the issue or evidence artifact. A failed row blocks release until its issue is resolved and the row is rerun.
