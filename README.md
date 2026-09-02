<div align="center">
  <img src="public/images/logo-mark.svg" alt="Verb logo" width="88" height="88" />

# Verb

### Nouns need eyes. Verbs need a voice.

**An accessible, real-time messenger whose meaningful actions are exposed as WebMCP tools.**

A blind or low-vision user can ask an AI agent to find, read, summarize, draft,
send, react, and navigate without making the agent guess where to click.

[Open the live app](https://messenger-clone-kappa-smoky.vercel.app) |
[View the public repository](https://github.com/hungtruongOwolf/webmcp-challenge) |
**Demo video: coming soon**

`WebMCP` | `Next.js 15` | `React 19` | `TypeScript` | `Supabase` | `MIT`
</div>

---

## Submission at a glance

| Requirement | Link or status |
|---|---|
| Working application | [messenger-clone-kappa-smoky.vercel.app](https://messenger-clone-kappa-smoky.vercel.app) |
| Demo video | **Coming soon** -- public YouTube link will be added here |
| Public source code | [github.com/hungtruongOwolf/webmcp-challenge](https://github.com/hungtruongOwolf/webmcp-challenge) |
| Open-source license | [MIT License](LICENSE) |
| WebMCP implementation | [Registration lifecycle](app/webmcp/connection-provider.tsx) | [tool catalog](lib/webmcp/register.ts) |

## Judge quick start

1. Open the [live app](https://messenger-clone-kappa-smoky.vercel.app) in
   ChatGPT's in-app browser, or in Google Chrome 149+ with
   `chrome://flags/#enable-webmcp-testing` enabled.
2. Sign in or create an account.
   If judging credentials are supplied with the Devpost submission, use those credentials.
   Sign-in is a human step by design: no WebMCP tool signs in or creates an account, so the agent only ever acts inside a session a person chose.
   If you open `/` while already signed in, the page shows a signed-in panel with the account name, a "Continue as ..." button, and a "Sign out and use a different account" button instead of silently redirecting.
3. Confirm that the page reports **WebMCP connected**.
4. Ask the agent to try a few natural-language tasks:

   > Check my Verb connection, list my conversations, and catch me up on
   > the most recent one.

   > Find messages about the launch, then draft a reply for me. Let me review
   > it before sending.

   > Describe the latest image in this conversation and react to the message
   > with a heart.

5. Open the in-app **WebMCP activity** panel to see tool registration and calls
   as they happen.

The project follows the browser setup recommended in the
[WebMCP Challenge resources](https://webmcp.devpost.com/resources).

## Why Verb is a strong fit for WebMCP

Close your eyes and try to operate a messaging app. Finding the unread thread,
locating the right control, reacting to a particular message, or understanding
an image can turn a simple conversation into a long navigation exercise.

Traditional browser agents do not fully solve that problem. They still inspect
screens, infer intent from labels and pixels, and attempt a sequence of clicks.
That approach is fragile, especially when the screen changes or user-generated
content contains misleading instructions.

WebMCP gives the page a semantic action layer. Verb does not ask the agent to
*find the send button*. It registers a typed `send_message` action. It does not
ask the agent to *scan the sidebar*. It provides `list_conversations`. The agent
works with the signed-in user's real session, and the application remains the
authority for validation, permissions, and side effects.

That is why this use case fits WebMCP so well: messaging is made of verbs.
Once those verbs are explicit, they no longer require sight, precise pointer
control, or knowledge of the current visual layout.

## A better human-agent experience

WebMCP lets the human express intent while the application supplies safe,
structured capabilities.

| The person asks... | The agent can... | The experience improves because... |
|---|---|---|
| "What did I miss?" | List, read, and summarize the relevant conversation | The user hears one useful recap instead of traversing a message history |
| "Did anyone mention the launch date?" | Search one conversation with an optional date range | The answer comes from structured results, not visual page scanning |
| "Reply that Friday works." | Save a draft, let the user review it, then send it | Composition and execution are separate, preserving human control |
| "What is in the photo?" | Retrieve the authorized image and ask a vision model to describe it | Visual content becomes accessible inside the same conversation flow |
| "Start a group with Maya and Tony." | Resolve people and create the group | A multi-screen workflow becomes one clear request |
| "Leave this group." | Explain the impact and require a second confirmed call | A destructive action stays deliberate and auditable |

Before WebMCP, completing these flows by voice required a screen-driving agent
to repeatedly interpret the interface. With Verb, people choose the goal and
retain control; agents combine explicit tools to carry it out.

## What the app includes

- One-to-one and group conversations with real-time messages, typing state,
  seen state, and sidebar updates
- Private image and file attachments backed by signed URLs
- Message search, reactions, and 20 emoji stickers
- Edit and delete your own messages; deleted messages leave a short placeholder
- Per-conversation drafts that persist when the user navigates away
- AI summaries that combine read and unread history into one coherent recap
- AI image descriptions for blind and low-vision users
- Passkey and password authentication
- A signed-in panel on the sign-in page that names the current account and offers Continue or Sign out, so creating an account for a second person never lands in the first person's session
- Keyboard and screen-reader-conscious authentication and navigation

## WebMCP implementation

Verb uses the browser's `document.modelContext` API directly.
A public `get_connection_status` tool is available before authentication.
After sign-in, the connection provider registers 25 session-scoped tools and removes them with an `AbortSignal` when the session changes.
Registration is keyed on the set of tool names, so client-side navigation never re-registers the catalog and an agent's tool handles stay valid across `open_conversation`.
Tool handlers live behind refs, so the catalog reads fresh state on every call without being torn down and rebuilt.
There is no sign-in tool on purpose.
A person signs in on the page first, and the agent works inside that session.

The real registration lifecycle lives in
[`app/webmcp/connection-provider.tsx`](app/webmcp/connection-provider.tsx).
In simplified form, each tool is registered like this:

```ts
const controller = new AbortController();

await document.modelContext.registerTool(
  {
    name: "get_connection_status",
    description: "Report whether the page is signed in and agent tools are connected.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false,
    },
    execute: async () => ({
      content: [{ type: "text", text: JSON.stringify(connectionState) }],
    }),
  },
  { signal: controller.signal }
);
```

The authenticated catalog is assembled in
[`lib/webmcp/register.ts`](lib/webmcp/register.ts). Each tool has a focused
description, JSON input schema, behavioral annotations, and an `execute`
function that uses the current user's browser session.

```text
Human voice or text
        v
AI agent chooses a registered tool
        v
document.modelContext.registerTool(...)
        v
Verb validates input and uses the signed-in Supabase session
        v
Postgres row-level security authorizes the operation
        v
Small, structured result returns to the agent and activity panel
```

### Registered tools

There are **26 registered tools in an authenticated session**: one public connection tool plus 25 messaging tools.

| Category | Tool | Purpose |
|---|---|---|
| Connection | `get_connection_status` | Report sign-in and WebMCP connection state |
| Discover | `list_conversations` | List the user's conversations |
| Discover | `read_conversation` | Read recent messages with pagination; shows edited and deleted state |
| Discover | `search_messages` | Search a conversation with an optional date range |
| Discover | `search_people` | Find a person by name or email |
| Discover | `list_people` | List everyone in the directory with online status |
| Discover | `get_my_profile` | Return the signed-in user's profile |
| Discover | `wait_for_new_messages` | Block until someone else writes, or time out (max 60 s) |
| Navigate | `open_conversation` | Open an existing conversation by id or by the other person's id |
| Navigate | `start_conversation` | Create a one-to-one chat (or reuse it) and open it; reports `created` |
| Compose | `draft_message` | Save a draft without sending it, for review before send |
| Compose | `send_message` | Send text in one call, or send the saved draft when no text is given |
| Compose | `send_attachment` | Send an image or file from a data URL, a public URL, or an existing message; re-sending from a different conversation needs a confirmed second call |
| Compose | `forward_message` | Forward a message's text and attachment into another conversation; forwarding out of a different conversation needs a confirmed second call |
| Compose | `edit_message` | Replace the text of your own message; it shows as edited |
| Compose | `delete_message` | Soft-delete your own message after explicit confirmation |
| Compose | `react_to_message` | Add or remove one of six reactions |
| Compose | `send_sticker` | Send one of 20 emoji stickers |
| Organize | `create_group` | Create a group from names, emails, or IDs |
| Organize | `delete_conversation` | Leave or delete a conversation after explicit confirmation |
| Understand | `summarize_conversation` | Produce one read-and-unread narrative summary |
| Understand | `describe_image` | Describe an authorized image with a vision model |
| Understand | `read_file` | Read an authorized shared file |
| Understand | `read_link` | Fetch text from a link shared in a message |
| Account | `setup_passkey` | Guide the user through passkey enrollment |
| Account | `sign_out` | End the session in this browser, after a confirmed second call |

## Safety and trust boundaries

Verb treats the application and database as the authority, not the agent.

- **Session-scoped authority:** tools run in the browser with the signed-in
  user's Supabase session. No service key or password is handed to the agent.
- **Database enforcement:** Postgres row-level security controls which
  conversations, messages, profiles, and files the user can access.
- **Untrusted content stays data:** message bodies are labeled as untrusted
  before returning to the agent, reducing the chance that prompt-injection
  text is mistaken for an instruction.
- **Bounded output:** shared result clamping keeps tool responses within a
  1,500-character budget.
- **Deliberate writes:** `send_message` accepts text directly for a one-call send, and `draft_message` then `send_message` lets the person review first.
  Leaving or deleting a conversation, deleting a message, and signing out require a second call with `confirm: true` after the user agrees.
  `forward_message` and `send_attachment` with `message_id` also need that second call when the source message lives in a different conversation than the target.
  The first call returns a preview that names the source conversation so the user can hear where the content is coming from.
- **Sign-out stays local:** `sign_out` ends the session in this browser only.
  Other devices stay signed in, so one injected call cannot log the person out everywhere.
- **Server-side fetches are pinned:** `read_link` and URL attachments resolve the host once, refuse private and cloud-metadata ranges on every redirect hop, and connect to the address that passed the check.
  Fetched attachment bodies stream under a size cap instead of being read whole.
- **Attachments stay in their conversation:** copying or re-sending an attachment checks that the file sits in the expected bucket and under the source conversation's folder, and file names are sanitized with an extension derived from the stored type.
- **Sign-in stays human:** the catalog has no sign-in or sign-up tool. The
  agent cannot pick or create an account; it only acts in the session a person
  opened on the page.
- **Lifecycle cleanup:** registration uses abort signals so tools from an old
  or signed-out session do not remain active.

## Security notes

The confirmation step on destructive and cross-conversation tools is an honor system.
The first call returns a preview and asks the agent to get the user's agreement, but nothing stops an agent from calling again with `confirm: true` on its own, because the in-page confirm dialog cannot outlive the tool-call timeout.
A server-issued one-time token tied to the preview is the planned follow-up.

Two more follow-ups are known and not yet done.
Uploaded and fetched attachments are typed by their declared content type and extension, not by sniffing the file's leading bytes.
The URL attachment route has no per-user rate limit, so one signed-in account could ask the server to fetch many remote files in a short window.

## Screenshots

| Light mode | Dark mode |
|---|---|
| ![Verb conversation view in light mode](.github/images/screenshot-light.jpg) | ![Verb conversation view in dark mode](.github/images/screenshot-dark.jpg) |

## Architecture

| Layer | Implementation |
|---|---|
| Web application | Next.js 15 App Router, React 19, TypeScript, Tailwind CSS |
| WebMCP lifecycle | Connection provider, public status tool, authenticated catalog, abort-based cleanup |
| Data and authorization | Supabase Postgres with row-level security and focused RPCs |
| Realtime | Database-triggered broadcasts on conversation and per-user topics |
| File storage | Private `chat-images`, `chat-files`, and `avatars` buckets with signed URLs |
| Authentication | Passkeys through Supabase WebAuthn and passwords |
| AI features | Configurable Anthropic, Gemini, or OpenAI provider for image descriptions and summaries |

### Project map

```text
app/
  api/                         messages, conversations, files, AI routes
  components/                  accessible UI and WebMCP activity panel
  conversations/              inbox and conversation views
  libs/                        Supabase, authentication, uploads, AI clients
  webmcp/                      browser API, connection lifecycle, tool registry
lib/webmcp/
  tools/                       one file per authenticated WebMCP tool
  register.ts                  assembles the authenticated catalog
  budget.ts                    output clamping and untrusted-content wrapping
supabase/migrations/           schema, RLS policies, triggers, storage, RPCs
e2e/                           Playwright accessibility coverage
tests/                         shared Vitest setup
```

## Run locally

### Prerequisites

- Node.js 20+
- npm
- A Supabase project
- At least one Anthropic, Gemini, or OpenAI API key for AI features

### Setup

```bash
git clone https://github.com/hungtruongOwolf/webmcp-challenge.git
cd webmcp-challenge
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_PASSKEY_RP_ID=localhost

# Add at least one provider key.
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
```

Apply the database migrations and start the application:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Upgrading an existing project

If your Supabase project was set up before message editing existed, run `npx supabase db push` again.
It applies `supabase/migrations/20260902000000_message_edit_delete.sql`, which adds `edited_at` and `deleted_at` to `messages`, relaxes the content check so a soft-deleted row may be empty, and grants authors the update policy that `edit_message` and `delete_message` rely on.
The same migration installs a `before update` trigger that stamps `edited_at` in Postgres whenever content changes and rejects any update that clears `deleted_at`, so an edit cannot hide itself or be backdated and a deleted message cannot be restored.
Without that migration those two tools fail with a database error and edited or deleted messages do not render.

> [!IMPORTANT]
> `NEXT_PUBLIC_APP_ORIGIN` and `NEXT_PUBLIC_PASSKEY_RP_ID` must describe the
> same host. Production passkeys also require HTTPS. `npm run build` verifies
> this configuration and rejects a production origin that points to localhost.

## Test and build

```bash
npm test                       # Vitest unit and component tests
npm run test:e2e               # Playwright end-to-end tests
npm run verify:passkey-config  # WebAuthn origin/RP validation
npm run build                  # production build
```

The accessible-auth Playwright spec uses a disposable Supabase account through
`E2E_USER_EMAIL` and `E2E_USER_PASSWORD`. Keep both variables server-side;
never expose them with a `NEXT_PUBLIC_` prefix.

## License

Verb is open-source software available under the [MIT License](LICENSE).

---

<div align="center">
  Built for the <a href="https://webmcp.devpost.com/">WebMCP Challenge</a>.
  <br />
  <strong>Nouns need eyes. Verbs need a voice.</strong>
</div>
