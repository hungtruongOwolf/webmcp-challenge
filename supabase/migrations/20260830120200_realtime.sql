-- =====================================================================
-- 03 · realtime
-- The three-channel model survives the move; only the wire changes.
--   presence-messenger  ->  online              (presence, finally works)
--   <conversationId>    ->  conversation:<uuid> (broadcast, DB-driven)
--   <user.email>        ->  user:<uuid>         (broadcast, no more emails)
--
-- Message events move INTO the database: the insert and the broadcast are
-- welded together, so a route handler can never again forget to announce
-- a write the way /api/messages had to remember twice.
-- =====================================================================

-- ------------------------------------------------- broadcast on message write
create or replace function public.broadcast_message_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'conversation:' || coalesce(new.conversation_id, old.conversation_id)::text,
    tg_op,             -- event
    tg_op,             -- operation
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger on_message_broadcast
after insert or update or delete on public.messages
for each row execute function public.broadcast_message_change();

-- --------------------------------------------- broadcast on read-receipt write
-- Drives the moving "Seen" checkmark that /seen used to announce by hand.
create or replace function public.broadcast_seen_change()
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
    'SEEN',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger on_seen_broadcast
after insert on public.message_seen
for each row execute function public.broadcast_seen_change();

-- =====================================================================
-- Channel authorization. This is what the dead /api/pusher/auth route was
-- supposed to do. Policies are OR'd, so each topic family gets its own.
-- =====================================================================

-- 1 · conversation:<uuid> -- members may listen, nobody may inject.
--     (The broadcasts themselves come from SECURITY DEFINER triggers,
--      which bypass RLS, so no INSERT policy is needed or wanted here.)
create policy "members receive conversation broadcasts"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and split_part((select realtime.topic()), ':', 1) = 'conversation'
  and public.is_conversation_member(
        nullif(split_part((select realtime.topic()), ':', 2), '')::uuid
      )
);

-- 2 · user:<uuid> -- your own inbox topic and no one else's.
create policy "receive own inbox broadcasts"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) = 'user:' || (select auth.uid())::text
);

-- 3 · online -- the global presence roster.
create policy "read presence roster"
on realtime.messages for select to authenticated
using (
  extension = 'presence'
  and (select realtime.topic()) = 'online'
);

create policy "announce yourself present"
on realtime.messages for insert to authenticated
with check (
  extension = 'presence'
  and (select realtime.topic()) = 'online'
);
