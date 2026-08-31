-- =====================================================================
-- 07 · drafts
--
-- Backs the WebMCP send_message / draft_message split: an agent can never
-- compose and send a message in one tool call. draft_message writes here
-- (private to its author, never broadcast to the other party); send_message
-- reads the saved draft back, asks the user to confirm, and only then
-- posts it as a real message -- and clears the draft either way.
-- =====================================================================

create table public.drafts (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.drafts enable row level security;

create policy "read own drafts"
on public.drafts for select to authenticated
using (user_id = (select auth.uid()));

create policy "write own drafts"
on public.drafts for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_conversation_member(conversation_id)
);

create policy "update own drafts"
on public.drafts for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "delete own drafts"
on public.drafts for delete to authenticated
using (user_id = (select auth.uid()));
