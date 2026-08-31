<a name="readme-top"></a>

# Verb

**Nouns need eyes. Verbs need a voice.**

A real-time messaging app where every meaningful action is also a
[WebMCP](https://github.com/webmachinelearning/webmcp) tool
(`document.modelContext`), so a blind or low-vision user can fully operate it
by talking to an AI agent (ChatGPT Voice, in the desktop app's built-in
browser) instead of needing to see or parse a screen.

**Live app:** https://messenger-clone-kappa-smoky.vercel.app
**Repo:** https://github.com/hungtruongOwolf/webmcp-challenge

![Conversation view](/.github/images/screenshot-light.jpg)
![Conversation view, dark mode](/.github/images/screenshot-dark.jpg)

<!-- Table of Contents -->
<details>
<summary><h2 style="display:inline">Table of Contents</h2></summary>

- [Why Verb](#why-verb)
- [Chat features](#chat-features)
- [WebMCP agent tools](#webmcp-agent-tools)
- [Security model](#security-model)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Folder structure](#folder-structure)
- [Credits](#credits)

</details>

## Why Verb

Close your eyes and try to use a chat app.

Not read about it. Actually try it. Find the search bar. Tell which message
is unread. React to the third message down without knowing where the third
message down even is. A screen reader gets you partway, reading out labels
in a layout that was never built with a blind person in mind. It's slow.
It's exhausting. For a lot of what you'd actually want to do, it just
doesn't work.

So the current answer, mostly, is: let an AI agent drive the browser for
you. Point it at the page, ask it to click around, hope it finds the right
thing. Which sounds helpful until you notice what that actually costs. To
click around for you, the agent needs your session, sometimes your literal
password. It's pretending to be you now, and if it clicks the wrong thing
(or a message in your inbox tricks it into clicking the wrong thing) that
happens under your name, with your access. That's not accessibility. That's
a liability wearing an accessibility costume.

Verb does it the other way. Sign in once with a passkey. A fingerprint, a
face scan, a device PIN, nothing to type or read aloud. From there, the page
itself tells the agent exactly what it's allowed to do: send this message,
react to that one, search this conversation, describe this photo, catch me
up on a thread I haven't opened in a week. Not "click here." A real action,
called directly, inside the session you already signed into. No password
changes hands. No guessing at pixels. We even seed a message with a prompt
injection in it, hidden text trying to hijack the agent into doing something
else, just to check: the agent still can't do anything your account
couldn't already do, because the database's own permissions are the wall.
Not the model's good behavior.

Nouns still need eyes. A photo, a wall of text, someone still has to see it,
or someone still has to describe it out loud.

Verbs don't. Send. React. Search. Catch up. Once those are things you can
ask for instead of things you have to click, they stop needing sight at
all.

They just need a voice.

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
| `describe_image` | Vision-model description of a shared photo, the core accessibility feature |
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
session: never a service key, never a credential handed to the agent.
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
  conversation, leaving one); everything else queries with the user's own
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
  API, pinned to an exact version, see `app/libs/supabase/client.ts`), email
  magic links, and passwords, built to stay usable via keyboard and screen
  reader throughout (`docs/superpowers/` has the original design notes).

## Getting started

1. Node 20+, npm.
2. `npm install` (a repo-level `.npmrc` already sets `legacy-peer-deps=true`
   for a `react-select`/`@headlessui` peer-range mismatch that will resolve
   itself once those packages catch up to React 19).
3. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, from your
     Supabase project's Settings → API.
   - `NEXT_PUBLIC_APP_ORIGIN` / `NEXT_PUBLIC_PASSKEY_RP_ID`, the exact origin
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
`E2E_USER_EMAIL` / `E2E_USER_PASSWORD`. Keep those server-side, never behind
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
([CodeWithAntonio](https://codewithantonio.com/) / sanidhyy). The original
MIT license notice is preserved in `LICENSE`. The data layer, auth, realtime
model, and the entire WebMCP agent tool layer were rebuilt for this project.

<br />
<p align="right">(<a href="#readme-top">back to top</a>)</p>
