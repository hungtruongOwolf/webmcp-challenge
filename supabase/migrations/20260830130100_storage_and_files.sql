-- =====================================================================
-- 08 · storage and file attachments
--
-- Ports the chat-images / avatars buckets and their RLS policies -- they
-- were created straight in the Storage dashboard and never captured in a
-- migration -- into git, and adds a general-purpose chat-files bucket
-- plus the messages columns needed to attach a non-image file.
--
-- Path convention for both buckets: <conversation_id>/<uploader_id>-<name>
-- (avatars: <user_id>-<name>). The uuid regex guards the folder(name)[1]
-- cast so a malformed path fails the policy instead of the query.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

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

-- chat-images (already live -- re-created here so git matches production)
create policy "members read chat images"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images'
  and is_conversation_member(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (storage.foldername(name))[1]::uuid
      else null::uuid
    end
  )
);

create policy "members upload chat images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and is_conversation_member(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (storage.foldername(name))[1]::uuid
      else null::uuid
    end
  )
);

create policy "uploaders delete chat images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and is_conversation_member(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (storage.foldername(name))[1]::uuid
      else null::uuid
    end
  )
);

-- avatars (already live -- re-created here so git matches production)
create policy "authenticated read avatars"
on storage.objects for select to authenticated
using (bucket_id = 'avatars');

create policy "users upload own avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users delete own avatars"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

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
  add column file_url text,
  add column file_name text,
  add column file_size bigint;

drop function if exists public.create_message(uuid, text, text);

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
alter table public.messages drop constraint message_has_content;
alter table public.messages
  add constraint message_has_content
  check (body is not null or image is not null or file_url is not null);
