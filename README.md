<a name="readme-top"></a>

# Messenger Clone — a WebMCP-native chat app

A real-time Messenger-style chat app where an AI agent can drive the UI on the
signed-in user's behalf through [WebMCP](https://github.com/webmachinelearning/webmcp)
(`document.modelContext`) — read conversations, send messages, react, send
stickers, summarize a whole thread, search, create groups — the same way a
sighted user would click through the app, except entirely through natural
language, in the browser tab the user is already signed into.

**Live app:** https://messenger-clone-kappa-smoky.vercel.app
**Repo:** https://github.com/hungtruongOwolf/webmcp-challenge

![Conversation view](/.github/images/screenshot-light.jpg)
![Conversation view, dark mode](/.github/images/screenshot-dark.jpg)

<!-- Table of Contents -->
<details>
<summary><h2 style="display:inline">Table of Contents</h2></summary>

- [What this is](#what-this-is)
- [Chat features](#chat-features)
- [WebMCP agent tools](#webmcp-agent-tools)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Folder structure](#folder-structure)
- [Tech stack](#tech-stack)
- [Credits](#credits)

</details>

## What this is

This started from an open-source Messenger clone tutorial (MongoDB + Prisma +
NextAuth + Pusher + Cloudinary) and was rebuilt for the WebMCP Challenge: the
data layer moved onto a single Supabase project (Postgres + row-level
security + Realtime + Storage), auth became passkey-first for a
click-once/tap-once sign-in that works well for voice and accessibility
tooling, and a full agent tool layer was added on top so an AI agent (ChatGPT
Desktop, Claude, or anything else that speaks WebMCP) can actually use the
app instead of just describing it.

The tool layer is scoped tightly: every tool call runs against the signed-in
user's own Supabase session (RLS-enforced, never a service key), destructive
actions (deleting/leaving a conversation) require a second, explicit
`confirm: true` call instead of popping an in-page dialog nobody watching a
voice session could click, and every response is clamped to a small character
budget so it fits comfortably in an agent's context.

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
| `describe_image` | Vision-model description of a shared photo |
| `read_file` | Read the contents of a shared file |
| `read_link` | Fetch and summarize a URL shared in chat |
| `sign_out` | End the session |
| `setup_passkey` | Walk through enrolling a passkey |
| `react_to_message` | Add/remove one of 6 preset emoji reactions |
| `send_sticker` | Send one of 20 preset emoji as a standalone sticker |
| `summarize_conversation` | One coherent narrative summary, read + unread combined |

Every tool response goes through a shared budget clamp (`lib/webmcp/budget.ts`)
so nothing blows past what an agent should reasonably read back.

## Architecture

- **Next.js 15 App Router, React 19, TypeScript, Tailwind.**
- **Supabase Postgres** is the only backend: schema + row-level security in
  `supabase/migrations/`. Authorization lives entirely in RLS policies (plus a
  handful of `SECURITY DEFINER` RPCs for operations that need to see across a
  membership boundary, like creating a conversation or leaving one) — server
  code queries with the user's own session, never a service key.
- **Realtime** is DB-trigger-driven: triggers call
  `realtime.broadcast_changes(...)` on `conversation:<uuid>` (everyone in that
  conversation) and `user:<uuid>` (one user's own sidebar/inbox) topics, so
  the UI updates from the database, not from the API route that happened to
  handle the write.
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

## Tech stack

Next.js · React · TypeScript · Tailwind CSS · Supabase (Postgres, Auth,
Realtime, Storage) · Vercel · Vitest · Playwright

## Credits

Scaffolded from an open-source Next.js Messenger clone tutorial
([CodeWithAntonio](https://codewithantonio.com/) / sanidhyy) — the original
MIT license notice is preserved in `LICENSE`. The data layer, auth, realtime
model, and the entire WebMCP agent tool layer were rebuilt for this project.

<br />
<p align="right">(<a href="#readme-top">back to top</a>)</p>
