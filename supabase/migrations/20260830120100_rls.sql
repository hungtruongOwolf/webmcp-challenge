-- =====================================================================
-- 02 · row level security
-- This file is the fix for "any signed-in user can read any conversation".
-- The app's server client carries the USER's cookie, never a service key,
-- so these policies apply to every query the app makes -- including the
-- ones nobody has written yet.
-- =====================================================================

alter table public.profiles             enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.message_seen         enable row level security;

-- ---------------------------------------------------------------- profiles
-- The People page lists everyone. That was always the intent; now it is a
-- policy instead of an accident.
create policy "authenticated read profiles"
on public.profiles for select to authenticated
using (true);

create policy "update own profile"
on public.profiles for update to authenticated
using      (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ----------------------------------------------------------- conversations
create policy "members read conversations"
on public.conversations for select to authenticated
using (public.is_conversation_member(id));

create policy "members delete conversations"
on public.conversations for delete to authenticated
using (public.is_conversation_member(id));

create policy "members rename conversations"
on public.conversations for update to authenticated
using      (public.is_conversation_member(id))
with check (public.is_conversation_member(id));

-- No INSERT policy, deliberately: create_conversation() is the only door.

-- ---------------------------------------------------------- membership rows
create policy "members read membership"
on public.conversation_members for select to authenticated
using (public.is_conversation_member(conversation_id));

create policy "leave a conversation"
on public.conversation_members for delete to authenticated
using (user_id = (select auth.uid()));

-- --------------------------------------------------------------- messages
create policy "members read messages"
on public.messages for select to authenticated
using (public.is_conversation_member(conversation_id));

create policy "members send messages"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_conversation_member(conversation_id)
);

-- ------------------------------------------------------------- read receipts
create policy "members read receipts"
on public.message_seen for select to authenticated
using (
  exists (
    select 1 from public.messages m
     where m.id = message_seen.message_id
       and public.is_conversation_member(m.conversation_id)
  )
);

create policy "mark messages seen as yourself"
on public.message_seen for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.messages m
     where m.id = message_seen.message_id
       and public.is_conversation_member(m.conversation_id)
  )
);
