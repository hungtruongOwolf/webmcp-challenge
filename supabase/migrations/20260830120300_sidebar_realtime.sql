-- =====================================================================
-- 04 · sidebar realtime
--
-- Conversation channels already receive message and receipt changes.
-- These triggers drive each member's user:<uuid> inbox channel so the
-- sidebar can add, reorder, refresh, and remove conversations live.
-- =====================================================================

-- A membership row is inserted only after create_conversation() has made
-- the conversation. Each new member receives one event on their own topic.
create or replace function public.broadcast_conversation_member_added()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'user:' || new.user_id::text,
    'INSERT',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger on_conversation_member_broadcast
after insert on public.conversation_members
for each row execute function public.broadcast_conversation_member_added();

-- A new message bumps the conversation to the top for every member.
create or replace function public.broadcast_conversation_activity()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select cm.user_id
      from public.conversation_members cm
     where cm.conversation_id = new.conversation_id
  loop
    perform realtime.broadcast_changes(
      'user:' || v_user_id::text,
      'UPDATE',
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  end loop;
  return null;
end;
$$;

create trigger on_message_sidebar_broadcast
after insert on public.messages
for each row execute function public.broadcast_conversation_activity();

-- A read receipt changes the current user's unread styling. Broadcast the
-- related message row so the client can recover its conversation_id.
create or replace function public.broadcast_conversation_seen()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
begin
  select m.* into v_message
    from public.messages m
   where m.id = new.message_id;

  if v_message.id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'user:' || new.user_id::text,
    'UPDATE',
    tg_op,
    'messages',
    'public',
    v_message,
    v_message
  );
  return null;
end;
$$;

create trigger on_seen_sidebar_broadcast
after insert on public.message_seen
for each row execute function public.broadcast_conversation_seen();

-- Capture the recipients before cascade deletion removes membership rows.
create or replace function public.broadcast_conversation_deleted()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select cm.user_id
      from public.conversation_members cm
     where cm.conversation_id = old.id
  loop
    perform realtime.broadcast_changes(
      'user:' || v_user_id::text,
      'DELETE',
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  end loop;
  return old;
end;
$$;

create trigger on_conversation_delete_broadcast
before delete on public.conversations
for each row execute function public.broadcast_conversation_deleted();
