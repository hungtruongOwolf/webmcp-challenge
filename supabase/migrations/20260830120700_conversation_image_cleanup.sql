-- =====================================================================
-- 07 · conversation image cleanup lifecycle
--
-- Conversation deletion is a three-step user-scoped operation: mark the
-- conversation as deleting, remove every object with the caller's
-- authenticated Storage client, then finalize only when Storage is empty.
-- No service-role credential is needed by the application.
--
-- Backfilled verbatim from supabase_migrations.schema_migrations -- this
-- was applied directly and never captured in a migration until now.
-- =====================================================================

alter table public.conversations
  add column deletion_requested_by uuid
    references public.profiles (id) on delete set null,
  add column deletion_requested_at timestamptz;

-- A chat-image upload holds a SHARE row lock until its Storage transaction
-- commits. begin_conversation_deletion() updates the same row, so it waits for
-- earlier uploads and becomes a barrier that rejects every later upload.
create or replace function public.can_upload_conversation_image(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer set search_path = ''
volatile
as $$
declare
  v_me uuid := (select auth.uid());
  v_allowed boolean;
begin
  if v_me is null or p_conversation_id is null then
    return false;
  end if;

  select c.deletion_requested_by is null
  into v_allowed
  from public.conversations c
  where c.id = p_conversation_id
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = c.id
    and cm.user_id = v_me
  )
  for share of c;

  return coalesce(v_allowed, false);
end;
$$;

revoke all on function public.can_upload_conversation_image(uuid) from public, anon;
grant execute on function public.can_upload_conversation_image(uuid) to authenticated;

create or replace function public.can_cleanup_conversation_images(
  p_conversation_id uuid
)
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_members cm
      on cm.conversation_id = c.id
      and cm.user_id = (select auth.uid())
    where c.id = p_conversation_id
    and c.deletion_requested_by = (select auth.uid())
  );
$$;

revoke all on function public.can_cleanup_conversation_images(uuid) from public, anon;
grant execute on function public.can_cleanup_conversation_images(uuid) to authenticated;

create or replace function public.begin_conversation_deletion(
  p_conversation_id uuid
)
returns boolean
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

  update public.conversations c
  set deletion_requested_by = v_me,
      deletion_requested_at = now()
  where c.id = p_conversation_id
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = c.id
    and cm.user_id = v_me
  )
  returning c.id into v_id;

  if v_id is null then
    raise exception 'conversation not found or caller is not a member';
  end if;

  return true;
end;
$$;

revoke all on function public.begin_conversation_deletion(uuid) from public, anon;
grant execute on function public.begin_conversation_deletion(uuid) to authenticated;

create or replace function public.finish_conversation_deletion(
  p_conversation_id uuid
)
returns boolean
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

  select c.id
  into v_id
  from public.conversations c
  join public.conversation_members cm
    on cm.conversation_id = c.id
    and cm.user_id = v_me
  where c.id = p_conversation_id
  and c.deletion_requested_by = v_me
  for update of c;

  if v_id is null then
    raise exception 'conversation cleanup is not authorized for caller';
  end if;

  if exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'chat-images'
    and (storage.foldername(o.name))[1] = p_conversation_id::text
  ) then
    raise exception 'conversation image cleanup is incomplete';
  end if;

  delete from public.conversations c
  where c.id = p_conversation_id;

  return true;
end;
$$;

revoke all on function public.finish_conversation_deletion(uuid) from public, anon;
grant execute on function public.finish_conversation_deletion(uuid) to authenticated;

-- Direct table deletion could bypass object cleanup, so finalization is now
-- the only authenticated path that may remove a conversation.
drop policy if exists "members delete conversations" on public.conversations;

drop policy if exists "members upload chat images" on storage.objects;

create policy "members upload chat images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and public.can_upload_conversation_image(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

create policy "conversation deleters remove chat images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-images'
  and public.can_cleanup_conversation_images(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

-- Reject messages after deletion is marked. The Storage upload barrier above
-- is the synchronization point for image lifecycle; create_message must not
-- hold a row lock because its last-message trigger updates this same row.
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

  if exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
    and c.deletion_requested_by is not null
  ) then
    raise exception 'conversation deletion is in progress';
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

revoke all on function public.create_message(uuid, text, text) from public, anon;
grant execute on function public.create_message(uuid, text, text) to authenticated;
