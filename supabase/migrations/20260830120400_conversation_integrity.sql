-- =====================================================================
-- 05 · conversation and message integrity
--
-- Normalize direct-chat membership in the database, make concurrent
-- find-or-create calls converge on one row, and keep message creation plus
-- the sender's initial read receipt in one transaction.
-- =====================================================================

alter table public.conversations add column direct_key text;

update public.conversations c
   set direct_key = pairs.direct_key
  from (
    select conversation_id,
           string_agg(user_id::text, ':' order by user_id) as direct_key,
           count(*) as member_count
      from public.conversation_members
     group by conversation_id
  ) pairs
 where c.id = pairs.conversation_id
   and c.is_group = false
   and pairs.member_count = 2;

do $$
begin
  if exists (
    select 1
      from public.conversations
     where is_group = false
       and direct_key is null
  ) then
    raise exception 'cannot enforce direct-chat integrity: a direct conversation does not have exactly two members';
  end if;
end;
$$;

alter table public.conversations
  add constraint conversations_direct_key_shape check (
    (is_group = true and direct_key is null)
    or (is_group = false and direct_key is not null)
  ),
  add constraint conversations_direct_key_unique unique (direct_key);

create or replace function public.create_conversation(
  p_member_ids uuid[],
  p_is_group boolean default false,
  p_name text default null
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_members uuid[];
  v_other uuid;
  v_direct_key text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(array_agg(member_id order by member_id), '{}'::uuid[])
    into v_members
    from (
      select distinct member_id
        from unnest(coalesce(p_member_ids, '{}'::uuid[])) as member_id
       where member_id <> v_me
    ) normalized;

  if p_is_group then
    if nullif(btrim(p_name), '') is null or cardinality(v_members) < 2 then
      raise exception 'a group needs a name and at least two distinct other members';
    end if;

    insert into public.conversations (name, is_group, direct_key)
    values (btrim(p_name), true, null)
    returning id into v_id;
  else
    if cardinality(v_members) <> 1 then
      raise exception 'a direct conversation needs exactly one distinct other member';
    end if;

    v_other := v_members[1];
    v_direct_key := least(v_me::text, v_other::text)
                    || ':' || greatest(v_me::text, v_other::text);

    insert into public.conversations (name, is_group, direct_key)
    values (null, false, v_direct_key)
    on conflict (direct_key) do update
      set direct_key = excluded.direct_key
    returning id into v_id;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  select v_id, member_id
    from unnest(array_append(v_members, v_me)) as member_id
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.create_conversation(uuid[], boolean, text)
  from public, anon;
grant execute on function public.create_conversation(uuid[], boolean, text)
  to authenticated;

create or replace function public.create_message(
  p_conversation_id uuid,
  p_body text default null,
  p_image text default null
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not a conversation member';
  end if;

  insert into public.messages (conversation_id, sender_id, body, image)
  values (p_conversation_id, v_me, p_body, p_image)
  returning id into v_id;

  insert into public.message_seen (message_id, user_id)
  values (v_id, v_me);

  return v_id;
end;
$$;

revoke all on function public.create_message(uuid, text, text)
  from public, anon;
grant execute on function public.create_message(uuid, text, text)
  to authenticated;

drop policy "members send messages" on public.messages;
