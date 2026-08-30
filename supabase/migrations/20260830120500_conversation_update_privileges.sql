-- =====================================================================
-- 06 · conversation update privileges
--
-- RLS decides which rows a member may update, while column privileges
-- decide what may change. Only the display name is client-editable;
-- structural and ordering fields belong to database functions/triggers.
-- =====================================================================

do $$
begin
  if exists (
    select 1
      from public.conversations c
      left join lateral (
        select count(*) as member_count,
               string_agg(cm.user_id::text, ':' order by cm.user_id) as expected_key
          from public.conversation_members cm
         where cm.conversation_id = c.id
      ) members on true
     where c.is_group = false
       and (
         members.member_count <> 2
         or c.direct_key is distinct from members.expected_key
       )
  ) then
    raise exception 'cannot harden conversation updates: an existing direct conversation violates its pair invariant';
  end if;
end;
$$;

revoke update on table public.conversations
  from public, anon, authenticated;
grant update (name) on table public.conversations
  to authenticated;

do $$
begin
  if has_column_privilege('authenticated', 'public.conversations', 'is_group', 'UPDATE')
     or has_column_privilege('authenticated', 'public.conversations', 'direct_key', 'UPDATE')
     or has_column_privilege('authenticated', 'public.conversations', 'last_message_at', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.conversations', 'name', 'UPDATE') then
    raise exception 'conversation column privileges do not match the intended policy';
  end if;
end;
$$;
