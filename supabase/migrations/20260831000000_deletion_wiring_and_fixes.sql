-- =====================================================================
-- 10 · conversation deletion wiring + a few logic-review fixes
--
-- 20260830120700_conversation_image_cleanup.sql dropped the direct-delete
-- RLS policy and added begin/finish_conversation_deletion(), but nothing in
-- the app ever called them -- the "Delete chat" button and delete_conversation
-- WebMCP tool both still did a raw table delete, which RLS now always
-- rejects (0 rows, "Invalid Id" for everyone). This migration finishes what
-- that one started:
--   1. chat-files gets the same upload barrier + cleanup-delete policy
--      chat-images already has (can_upload_conversation_image /
--      can_cleanup_conversation_images are bucket-agnostic despite their
--      names -- they only look at the conversation, not the bucket).
--   2. finish_conversation_deletion() checks both buckets for leftovers,
--      not just chat-images, so chat-files can't be orphaned.
--   3. create_message() checks membership before deletion status, so a
--      non-member probing a conversation id gets "not a conversation
--      member" instead of leaking that the conversation is being deleted.
--   4. drafts' "update own drafts" policy now matches "write own drafts" --
--      a removed member can no longer overwrite their stale draft row.
-- =====================================================================

drop policy if exists "members upload chat files" on storage.objects;

create policy "members upload chat files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and public.can_upload_conversation_image(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

create policy "conversation deleters remove chat files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-files'
  and public.can_cleanup_conversation_images(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

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
    where o.bucket_id in ('chat-images', 'chat-files')
    and (storage.foldername(o.name))[1] = p_conversation_id::text
  ) then
    raise exception 'conversation image cleanup is incomplete';
  end if;

  delete from public.conversations c
  where c.id = p_conversation_id;

  return true;
end;
$$;

create or replace function public.create_message(
  p_conversation_id uuid,
  p_body text default null,
  p_image text default null,
  p_file_url text default null,
  p_file_name text default null,
  p_file_size bigint default null
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

  if exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
    and c.deletion_requested_by is not null
  ) then
    raise exception 'conversation deletion is in progress';
  end if;

  insert into public.messages (conversation_id, sender_id, body, image, file_url, file_name, file_size)
  values (p_conversation_id, v_me, p_body, p_image, p_file_url, p_file_name, p_file_size)
  returning id into v_id;

  insert into public.message_seen (message_id, user_id)
  values (v_id, v_me);

  return v_id;
end;
$$;

drop policy if exists "update own drafts" on public.drafts;

create policy "update own drafts"
on public.drafts for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and public.is_conversation_member(conversation_id)
);
