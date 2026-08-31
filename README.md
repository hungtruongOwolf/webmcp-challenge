<a name="readme-top"></a>

# Verb

**Nouns need eyes. Verbs need a voice.**

A real-time messaging app where every meaningful action is also a
[WebMCP](https://github.com/webmachinelearning/webmcp) tool
(`document.modelContext`) — so a blind or low-vision user can fully operate
it by talking to an AI agent (ChatGPT Voice, in the desktop app's built-in
browser) instead of needing to see or parse a screen.

**Live app:** https://messenger-clone-kappa-smoky.vercel.app
**Repo:** https://github.com/hungtruongOwolf/webmcp-challenge

![Conversation view](/.github/images/screenshot-light.jpg)
![Conversation view, dark mode](/.github/images/screenshot-dark.jpg)

<!-- Table of Contents -->
<details>
<summary><h2 style="display:inline">Table of Contents</h2></summary>

- [The problem](#the-problem)
- [The idea](#the-idea)
- [Chat features](#chat-features)
- [WebMCP agent tools](#webmcp-agent-tools)
- [Security model](#security-model)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Folder structure](#folder-structure)
- [Credits](#credits)

</details>

## The problem

A web app's interface is a visual surface — buttons, avatars, a message
list — built to be seen. A blind or low-vision person either fights it
through a screen reader reading out a DOM that was never designed for that,
or hands an AI agent their password/session so it can "drive the browser" on
their behalf, which means trusting that agent with full account access and
hoping it clicks the right pixels. Neither is actually accessible; the
second one isn't even safe.

## The idea

**Verb** is an ordinary, fully-featured real-time messenger — but every
action a sighted user could take (send a message, react, search, join a
group, catch up on a conversation) is *also* declared as a structured tool
the page exposes to an agent via WebMCP, right inside the user's own
already-authenticated session. The user signs in once with a passkey — no
password to type or read aloud — and from there just talks: "read me my
messages," "reply saying I'll be there at 7," "what's in that photo Grace
sent," "catch me up on the whole group chat." The agent calls the app's own
tools directly, on explicit intent and schema, instead of guessing at pixels
or screen-reader output — and it never sees a credential, because it never
needs one.

Nouns — photos, files, a wall of text — still need eyes, or a description.
Verbs don't. They just need a voice.

## Chat features

- 1:1 and group conversations, real-time messages, typing/seen state
- Image and file attachments (private Storage buckets, signed URLs)
- Message reactions (6 preset emoji) and stickers (20 preset emoji, sent as a
  standalone oversized message)
- Drafts that persist per conversation and resurface when you come back
- Search within a conversation, and one-shot AI summaries that combine
  read *and* unread history into a single coherent recap
- AI image description for screen-reader / low-vision users
- Passkey, email-link, and password sign-in; passkeys can be added/removed
  from account settings on any signed-in device

## WebMCP agent tools

18 tools, registered from `lib/webmcp/register.ts`:

| Tool | What it does |
|---|---|
| `list_conversations` | List the signed-in user's conversations |
| `read_conversation` | Read a conversation's recent messages, paginated |
| `search_messages` | Find a word/phrase in one conversation, optional date range |
| `search_people` | Find someone by name or email |
| `get_my_profile` | The signed-in user's own name/email/id |
| `open_conversation` | Navigate the UI to a conversation |
| `create_group` | Create a group chat, resolving names/emails automatically |
| `draft_message` | Stage a reply without sending it |
| `send_message` | Send a message (two-call pattern with `draft_message`) |
| `delete_conversation` | Leave a conversation, or delete it if you're the last member |
| `describe_image` | Vision-model description of a shared photo -- the core accessibility feature |
| `read_file` | Read the contents of a shared file |
| `read_link` | Fetch and summarize a URL shared in chat |
| `sign_out` | End the session |
| `setup_passkey` | Walk through enrolling a passkey |
| `react_to_message` | Add/remove one of 6 preset emoji reactions |
| `send_sticker` | Send one of 20 preset emoji as a standalone sticker |
| `summarize_conversation` | One coherent narrative summary, read + unread combined |

Every tool response goes through a shared budget clamp (`lib/webmcp/budget.ts`)
so nothing blows past what an agent should reasonably read back, and
destructive actions (leaving/deleting a conversation) require a second,
explicit `confirm: true` call rather than popping an in-page dialog nobody
watching a voice session could click.

## Security model

WebMCP tools execute in-browser under the signed-in user's real Supabase
session — never a service key, never a credential handed to the agent.
**Postgres row-level security is the actual trust boundary**, not the
agent's good behavior: even a fully prompt-injected agent (the demo seeds a
message containing an injected instruction the agent must read but not obey)
cannot read or write anything the signed-in user's own RLS policies don't
already allow.

## Architecture

- **Next.js 15 App Router, React 19, TypeScript, Tailwind.**
- **Supabase Postgres** is the only backend: schema + row-level security in
  `supabase/migrations/`. A handful of `SECURITY DEFINER` RPCs handle
  operations that need to see across a membership boundary (creating a
  conversation, leaving one) — everything else queries with the user's own
  session.
- **Realtime** is DB-trigger-driven: triggers call
  `realtime.broadcast_changes(...)` on `conversation:<uuid>` (everyone in
  that conversation) and `user:<uuid>` (one user's own sidebar/inbox) topics,
  so the UI updates from the database, not from whichever API route happened
  to handle the write.
- **Storage** (`chat-images`, `chat-files`, `avatars`) is three private
  buckets; the app hands out long-lived signed URLs rather than making
  anything public, with folder-scoped RLS as the real access boundary.
- **Auth** supports passkeys (`@supabase/supabase-js`'s experimental WebAuthn
  API, pinned to an exact version — see `app/libs/supabase/client.ts`), email
  magic links, and passwords, built to stay usable via keyboard and screen
  reader throughout (`docs/superpowers/` has the original design notes).

## Getting started

1. Node 20+, npm.
2. `npm install` (a repo-level `.npmrc` already sets `legacy-peer-deps=true`
   for a `react-select`/`@headlessui` peer-range mismatch that will resolve
   itself once those packages catch up to React 19).
3. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your
     Supabase project's Settings → API.
   - `NEXT_PUBLIC_APP_ORIGIN` / `NEXT_PUBLIC_PASSKEY_RP_ID` — the exact origin
     you'll run on and its hostname. Locally that's `http://localhost:3000`
     and `localhost`; production needs a real HTTPS origin, and changing this
     value later invalidates every passkey already enrolled against it.
   - At least one of `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` /
     `OPENAI_API_KEY`, for `describe_image` and `summarize_conversation`.
4. Apply the schema: `npx supabase link --project-ref <your-project-ref>`
   then `npx supabase db push`.
5. `npm run dev`.

`npm run build` also runs `verify:passkey-config`
(`scripts/check-passkey-config.mjs`), which fails the build if
`NEXT_PUBLIC_APP_ORIGIN`'s hostname doesn't exactly match
`NEXT_PUBLIC_PASSKEY_RP_ID`, or if production is pointed at `localhost`.

## Testing

```bash
npm test              # vitest, component/unit
npm run test:e2e      # playwright
npm run verify:passkey-config
```

Playwright's accessible-auth spec needs a disposable Supabase test account via
`E2E_USER_EMAIL` / `E2E_USER_PASSWORD` — keep those server-side, never behind
a `NEXT_PUBLIC_` prefix.

## Folder structure

```
messenger-clone/
  app/
    (site)/                  landing + sign-in
    actions/                 server-side data fetchers
    api/                     conversations, messages, describe, summarize, ...
    auth/                    passkey enrollment, auth callback
    components/              shared UI (auth, accessibility, inputs, modals)
    context/                 current-user, WebMCP connection, confirm bridge
    conversations/           conversation list + [conversationId] thread UI
    hooks/                   use-conversation, use-passkey-readiness, ...
    libs/                    supabase client/server/upload, auth gateway
    webmcp/                  WebMCP connection provider + tool registry glue
  lib/webmcp/
    tools/                   one file per agent tool
    register.ts              wires every tool into the WebMCP registry
    budget.ts                shared output-size clamp
  supabase/migrations/       schema, RLS, triggers, RPCs (15 migrations)
  docs/superpowers/          original accessible-auth design/plan docs
  e2e/, tests/               Playwright spec, Vitest setup
```

## Credits

Scaffolded from an open-source Next.js Messenger clone tutorial
([CodeWithAntonio](https://codewithantonio.com/) / sanidhyy) — the original
MIT license notice is preserved in `LICENSE`. The data layer, auth, realtime
model, and the entire WebMCP agent tool layer were rebuilt for this project.

<br />
<p align="right">(<a href="#readme-top">back to top</a>)</p>
