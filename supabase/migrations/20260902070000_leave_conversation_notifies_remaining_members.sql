-- =====================================================================
-- broadcast_conversation_member_removed() only ever told the leaver's
-- own sidebar (their user:<uuid> topic) that they left. Nobody else was
-- told anything: the remaining members' Header/ProfileDrawer/avatar
-- group for that conversation had no event to react to, so a departed
-- member's avatar and the member count stayed stale until a full reload.
--
-- The conversation:<uuid> topic is the one every remaining member's open
-- Thread is already subscribed to (for messages/seen/reactions) -- add
-- one broadcast there, shaped as a conversation_members DELETE, so an
-- open thread can drop the departed member from its own live view the
-- same way it already reacts to other row changes on that topic.
-- =====================================================================

create or replace function public.broadcast_conversation_member_removed()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
begin
  select c.* into v_conversation
    from public.conversations c
   where c.id = old.conversation_id;

  if v_conversation.id is null then
    return old;
  end if;

  perform realtime.broadcast_changes(
    'user:' || old.user_id::text,
    'DELETE',
    tg_op,
    'conversations',
    'public',
    null,
    v_conversation
  );

  perform realtime.broadcast_changes(
    'conversation:' || old.conversation_id::text,
    'DELETE',
    tg_op,
    'conversation_members',
    'public',
    null,
    old
  );

  return old;
end;
$$;
