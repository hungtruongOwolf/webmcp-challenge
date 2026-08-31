-- =====================================================================
-- 11 - leave conversation, not "delete for everyone"
--
-- delete_conversation (WebMCP tool and the "Delete chat" button) used to
-- run the full begin/finish_conversation_deletion flow unconditionally --
-- for a group, one member deleting wiped it for every other member too,
-- which is not what "delete chat" means in any messaging app. The correct
-- behaviour: leaving removes only your own membership row (and with it,
-- your visibility -- conversations.select is already gated by
-- is_conversation_member). Only when the caller is the LAST member does
-- anything actually get destroyed, since nobody else can see it anyway.
-- This applies uniformly to DMs and groups: leaving a 2-person DM just
-- removes you, the other person keeps their full history.
-- =====================================================================

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
