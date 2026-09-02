-- =====================================================================
-- 16 . message edit and delete
--
-- Authors can fix a typo or take a message back. Deletion is soft: the
-- row stays so the thread keeps a "This message was deleted" placeholder
-- in place, but its content columns are emptied so nothing lingers.
-- =====================================================================

alter table public.messages
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz;

-- The content check predates soft deletion and would reject an emptied row.
alter table public.messages drop constraint if exists message_has_content;
alter table public.messages
  add constraint message_has_content
  check (
    deleted_at is not null
    or nullif(btrim(body), '') is not null
    or image is not null
    or file_url is not null
  );

-- edited_at is stamped here, not by the client, so an edit can neither hide
-- itself nor be backdated, and a deleted message cannot be brought back by
-- clearing deleted_at.
create or replace function public.stamp_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'a deleted message cannot be restored';
  end if;

  if new.deleted_at is null and (
       new.body      is distinct from old.body
    or new.image     is distinct from old.image
    or new.file_url  is distinct from old.file_url
    or new.file_name is distinct from old.file_name
    or new.file_size is distinct from old.file_size
  ) then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;

drop trigger if exists on_message_update_stamp on public.messages;
create trigger on_message_update_stamp
before update on public.messages
for each row execute function public.stamp_message_update();

create policy "authors edit own messages"
on public.messages for update to authenticated
using      (sender_id = (select auth.uid()))
with check (sender_id = (select auth.uid()));

-- Same shape as conversations: RLS picks the rows, column privileges pick
-- what may change. sender_id, conversation_id, and created_at stay fixed.
revoke update on table public.messages from public, anon, authenticated;
grant update (body, image, file_url, file_name, file_size, edited_at, deleted_at)
  on table public.messages to authenticated;

do $$
begin
  if has_column_privilege('authenticated', 'public.messages', 'sender_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.messages', 'conversation_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.messages', 'created_at', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.messages', 'body', 'UPDATE') then
    raise exception 'message column privileges do not match the intended policy';
  end if;
end;
$$;

-- The sidebar preview has to follow edits and deletions, not only inserts.
-- (The conversation channel already receives every update via
-- on_message_broadcast.)
drop trigger if exists on_message_sidebar_broadcast on public.messages;
create trigger on_message_sidebar_broadcast
after insert or update of body, edited_at, deleted_at on public.messages
for each row execute function public.broadcast_conversation_activity();
