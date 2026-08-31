-- =====================================================================
-- 09 · storage and file attachments
--
-- chat-images and avatars (buckets + RLS) already exist as of
-- 20260830120600_storage.sql and 20260830120700_conversation_image_cleanup.sql --
-- this migration only adds a general-purpose chat-files bucket plus the
-- messages columns needed to attach a non-image file.
--
-- Path convention: <conversation_id>/<uploader_id>-<name>. The uuid regex
-- guards the folder(name)[1] cast so a malformed path fails the policy
-- instead of the query.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 20971520, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip'
])
on conflict (id) do nothing;

-- chat-files -- same shape as chat-images, general-purpose attachments
create policy "members read chat files"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-files'
  and is_conversation_member(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (storage.foldername(name))[1]::uuid
      else null::uuid
    end
  )
);

create policy "members upload chat files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and is_conversation_member(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (storage.foldername(name))[1]::uuid
      else null::uuid
    end
  )
);

create policy "uploaders delete chat files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and is_conversation_member(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (storage.foldername(name))[1]::uuid
      else null::uuid
    end
  )
);

-- messages: generic file attachment, separate from the existing `image`
-- column which stays as-is for inline image previews
alter table public.messages
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_size bigint;

drop function if exists public.create_message(uuid, text, text);

-- Carries forward the deletion-in-progress guard from
-- 20260830120700_conversation_image_cleanup.sql -- create_message must keep
-- rejecting messages on a conversation mid-deletion, and must not hold a row
-- lock (its last-message trigger updates the same conversations row).
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

  insert into public.messages (conversation_id, sender_id, body, image, file_url, file_name, file_size)
  values (p_conversation_id, v_me, p_body, p_image, p_file_url, p_file_name, p_file_size)
  returning id into v_id;

  insert into public.message_seen (message_id, user_id)
  values (v_id, v_me);

  return v_id;
end;
$$;

revoke all on function public.create_message(uuid, text, text, text, text, bigint)
  from public, anon;
grant execute on function public.create_message(uuid, text, text, text, text, bigint)
  to authenticated;

-- the original schema migration's message_has_content check predates the
-- file columns and would reject a file-only message
alter table public.messages drop constraint if exists message_has_content;
alter table public.messages
  add constraint message_has_content
  check (body is not null or image is not null or file_url is not null);
