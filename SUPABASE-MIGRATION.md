# Supabase migration — status and next steps

Moving this app off MongoDB/Prisma + NextAuth + Pusher onto a single Supabase
project, with passkeys as the everyday sign-in.

**Branch:** `supabase-migration` · **Project ref:** `udmxnhjcsokfjednrrct` (`webMCP`, Postgres 17, ca-central-1)

---

## Where it stands

| Phase | | |
|---|---|---|
| 0 · Project setup | **done** | project created, passkeys enabled (RP ID `localhost`), email confirmation off |
| 1 · Schema, RLS, triggers | **done** | 3 migrations applied; security gate passed |
| 2 · Auth swap | **done** (needs human verification) | NextAuth fully removed; passkey sign-in built |
| 3 · Data layer | **partial** | reads migrated; **4 route handlers still on Prisma** |
| 4 · Realtime | **not started** | 7 files still on Pusher |
| 5 · Storage + teardown | **not started** | optional |

`npm run build` passes. The app runs, you can sign in, and you can *read*
conversations. **You cannot send a message yet** — that is Phase 3.

---

## What is already true (do not redo these)

- **Zero `next-auth` imports remain** in app code. `authOptions.ts`,
  `/api/auth/[...nextauth]`, `/api/register`, `auth-context.tsx` and
  `get-session.ts` are deleted.
- **`/api/pusher/auth.ts` is deleted.** It was a Pages-Router handler sitting in
  the App Router and had never been routable — confirmed 404 against a running
  server. Supabase Realtime authorizes channels with an RLS policy instead
  (already written, see `20260830120200_realtime.sql`).
- **RLS is the authorization layer.** Server code uses the user's cookie, never
  a service key. `getMessages()` deliberately has *no* auth check and is still
  safe. Do not add manual membership checks in queries — they are redundant.
- **Conversation creation goes through `create_conversation()`**, a
  `SECURITY DEFINER` RPC. There is intentionally **no INSERT policy** on
  `conversations` / `conversation_members`. It also absorbs the find-or-create
  for 1:1 chats (the old Mongo `hasEvery` query).

---

## Phase 3 — finish the data layer

Four route handlers still import `@/app/libs/prismadb`:

- `app/api/messages/route.ts`
- `app/api/conversations/route.ts`
- `app/api/conversations/[conversationId]/route.ts`
- `app/api/conversations/[conversationId]/seen/route.ts`

Rewrite each on `createClient()` from `@/app/libs/supabase/server`.

### ⚠ Preserve the HTTP contract in camelCase

A teammate is building **WebMCP tools over the chat**, and they call these
endpoints. Request and response shapes must stay byte-identical to the Prisma
versions even though the database now returns snake_case. Map at the route
boundary:

```ts
// database row -> HTTP response
const toMessageDTO = (m: any) => ({
  id: m.id,
  body: m.body,
  image: m.image,
  createdAt: m.created_at,
  senderId: m.sender_id,
  conversationId: m.conversation_id,
  sender: m.sender,
  seen: m.seen,
});
```

Component internals use snake_case (`is_group`, `created_at`) — that is
deliberate and already done. **Only the `/api/*` boundary is camelCase.**

### Notes per route

- **`POST /api/messages`** — insert into `messages`; do **not** hand-write the
  `lastMessageAt` update or any Pusher trigger. Database triggers already bump
  `last_message_at` and broadcast the change.
- **`POST /api/conversations`** — call the RPC, do not insert directly:
  `supabase.rpc("create_conversation", { p_member_ids, p_is_group, p_name })`
  returns the conversation uuid. It handles find-or-create for 1:1.
- **`DELETE /api/conversations/[id]`** — plain delete; RLS restricts it to members.
- **`POST /.../seen`** — upsert into `message_seen`. The broadcast is a trigger.

**Gate:** create a conversation, send, mark seen, delete — all working with a
page reload.

---

## Phase 4 — realtime

Seven files still import `@/app/libs/pusher`. Topic mapping:

| Pusher | Supabase topic | Notes |
|---|---|---|
| `presence-messenger` | `online` | presence extension; this feature never worked before |
| `<conversationId>` | `conversation:<uuid>` | broadcasts come from a DB trigger, not the route |
| `<user.email>` | `user:<uuid>` | **keyed by uuid now, not email** |

Client pattern:

```ts
const channel = supabase
  .channel(`conversation:${conversationId}`, { config: { private: true } })
  .on("broadcast", { event: "INSERT" }, ({ payload }) => { /* … */ })
  .subscribe();

// teardown removes every handler at once
supabase.removeChannel(channel);
```

Two bugs from the old code that must **not** be reintroduced:

1. `conversation-list.tsx` unbound the wrong handler (`newHandler` where
   `updateHandler` was meant). `removeChannel()` makes this class of bug
   impossible — use it.
2. `body.tsx` used client-wide `pusherClient.bind()`, which fires for every
   subscribed channel. Bind on the channel object instead.

`use-active-channel.ts` should become Supabase presence and feed the existing
`use-active-list.ts` zustand store unchanged.

**Gate:** two browsers — live messages both ways, sidebar reorders, seen ticks
move, presence dots track.

---

## Phase 5 — storage + teardown (optional)

Cloudinary → a `chat-images` bucket. Then remove dead deps:
`next-auth`, `@next-auth/prisma-adapter`, `bcrypt`, `@types/bcrypt`, `prisma`,
`@prisma/client`, `pusher`, `pusher-js`, and delete `app/libs/prismadb.ts` +
`prisma/`. Removing `bcrypt` also removes the native-build step from setup.

---

## Gotchas already paid for

- **RLS recursion.** A policy on `conversation_members` that queries
  `conversation_members` recurses forever. Use the existing
  `public.is_conversation_member(uuid)` `SECURITY DEFINER` helper.
- **Passkeys are beta.** `@supabase/supabase-js` is pinned to an exact
  `2.112.4` — do not widen it to a caret. Note: the documented
  `experimental: { passkey: true }` opt-in is **not enforced** in this version;
  the methods exist regardless. The pin is the real safeguard.
- **RP ID is a one-way door.** Currently `localhost`. Changing it invalidates
  every enrolled passkey. Decide the production domain before real users enrol.
- **Passkey enrolment needs a confirmed user.** Email confirmation is off in
  dev for exactly this reason. Turn it back on before any real deployment.
- **Supabase rejects `@example.com`** for signups. Use another domain in tests.
- **`npm install` needs `--legacy-peer-deps`** (see `SETUP-LOCAL.md`).

---

## Verifying

```bash
npm run build                                   # must pass
npx supabase migration list                     # local and remote in sync
npx supabase db push                            # after adding a migration
npx supabase gen types typescript --project-id udmxnhjcsokfjednrrct > app/types/database.ts
```

Regenerate types after **every** migration; `app/types/index.ts` derives all
row types from that file.
