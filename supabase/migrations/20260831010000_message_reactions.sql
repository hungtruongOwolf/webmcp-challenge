-- =====================================================================
-- Message reactions
-- One reaction per user per message, from a fixed emoji set -- picking a
-- new emoji replaces your old one (primary key is message_id, user_id).
-- Broadcasts ride the same conversation:<uuid> topic as messages/seen.
-- =====================================================================

create table public.message_reactions (
  message_id uuid not null references public.messages on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  emoji      text not null check (emoji in ('👍','❤️','😆','😮','😢','😡')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index message_reactions_message_idx on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

create policy "members read reactions"
on public.message_reactions for select to authenticated
using (
  exists (
    select 1 from public.messages m
     where m.id = message_reactions.message_id
       and public.is_conversation_member(m.conversation_id)
  )
);

create policy "react as yourself"
on public.message_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.messages m
     where m.id = message_reactions.message_id
       and public.is_conversation_member(m.conversation_id)
  )
);

create policy "change your own reaction"
on public.message_reactions for update to authenticated
using      (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "remove your own reaction"
on public.message_reactions for delete to authenticated
using (user_id = (select auth.uid()));

-- --------------------------------------------- broadcast on reaction write
create or replace function public.broadcast_reaction_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_conversation uuid;
begin
  select m.conversation_id into v_conversation
    from public.messages m
   where m.id = coalesce(new.message_id, old.message_id);

  if v_conversation is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'conversation:' || v_conversation::text,
    'REACTION',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger on_reaction_broadcast
after insert or update or delete on public.message_reactions
for each row execute function public.broadcast_reaction_change();
