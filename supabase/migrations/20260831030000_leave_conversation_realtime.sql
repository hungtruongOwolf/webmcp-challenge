-- =====================================================================
-- 12 - notify the leaver's own sidebar when they leave without deleting
--
-- leave_conversation() removes only the caller's conversation_members row
-- when others remain -- but nothing broadcast that, so the leaver's own
-- sidebar kept showing the conversation until a full page reload (the
-- backend was correct, the UI just never heard about it). Broadcasting a
-- DELETE shaped like a `conversations` row change, on the leaver's own
-- user:<uuid> topic, reuses the exact client handler that already removes
-- a conversation on the real delete path (on_conversation_delete_broadcast
-- below) -- no client code change needed.
--
-- When the leaver was the LAST member, finish_conversation_deletion() goes
-- on to delete the conversations row, which cascades into this same
-- conversation_members delete. That path is already fully covered by
-- on_conversation_delete_broadcast (which fires first and reaches every
-- member), so this trigger checks the conversation still exists and
-- no-ops for the cascade case to avoid a duplicate broadcast.
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
  return old;
end;
$$;

create trigger on_conversation_member_removed_broadcast
after delete on public.conversation_members
for each row execute function public.broadcast_conversation_member_removed();
