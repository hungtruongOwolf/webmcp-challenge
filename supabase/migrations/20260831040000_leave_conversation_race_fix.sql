-- =====================================================================
-- 12 - close the direct-delete bypass + TOCTOU race on leaving
--
-- Two related bugs, same failure mode: a conversation ends up with zero
-- members but never gets marked for deletion, so finish_conversation_
-- deletion() (which requires deletion_requested_by to be set) can never
-- run -- the conversation, its messages, reactions, drafts, and Storage
-- objects are orphaned forever.
--
-- 1. The "leave a conversation" policy let ANY client issue a raw
--    `delete from conversation_members where user_id = auth.uid()`
--    directly, completely bypassing leave_conversation(). No app code
--    actually does this (leaving always goes through the RPC via
--    /api/conversations/[id] DELETE), so the policy is pure attack
--    surface -- removed.
--
-- 2. leave_conversation() counted members with no lock, so two members
--    of the same conversation calling it at the exact same moment could
--    both read count > 1 and both just delete their own row, leaving 0
--    members with deletion_requested_by never set. Fixed by locking the
--    conversation row first, which serializes concurrent callers.
-- =====================================================================

drop policy if exists "leave a conversation" on public.conversation_members;

create or replace function public.leave_conversation(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_member_count int;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  -- Locks the conversation row so concurrent leave_conversation() calls
  -- for the same conversation serialize instead of racing on the member
  -- count below.
  perform 1 from public.conversations where id = p_conversation_id for update;

  if not exists (
    select 1 from public.conversation_members
     where conversation_id = p_conversation_id
       and user_id = v_me
  ) then
    raise exception 'conversation not found or caller is not a member';
  end if;

  select count(*) into v_member_count
    from public.conversation_members
   where conversation_id = p_conversation_id;

  if v_member_count > 1 then
    delete from public.conversation_members
     where conversation_id = p_conversation_id
       and user_id = v_me;

    return false;
  end if;

  update public.conversations c
     set deletion_requested_by = v_me,
         deletion_requested_at = now()
   where c.id = p_conversation_id;

  return true;
end;
$$;

revoke all on function public.leave_conversation(uuid) from public, anon;
grant execute on function public.leave_conversation(uuid) to authenticated;
