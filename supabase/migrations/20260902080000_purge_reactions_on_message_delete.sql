-- =====================================================================
-- stamp_message_edit() already nulls body/image/file_* when a message is
-- deleted, but left message_reactions rows for that message untouched.
-- Combined with the deleted_at guard just added to the reactions UPDATE
-- policy, a reaction *change* (not a first react) that loses a race
-- against the message being deleted is correctly rejected -- but the
-- reaction row as it stood before that race is still left behind,
-- attached to a now-deleted message. read_conversation renders
-- reactions independently of deleted_at, so that stale reaction can
-- resurface there next to a "[message deleted]" line.
--
-- Once a message is deleted its reactions are meaningless the same way
-- its body/image/file are -- purge them as part of the same delete
-- transition, and backfill any that are already in this state.
-- =====================================================================

create or replace function public.stamp_message_edit()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    if new.deleted_at is null then
      raise exception 'a deleted message cannot be restored';
    end if;
    new.body      := old.body;
    new.image     := old.image;
    new.file_url  := old.file_url;
    new.file_name := old.file_name;
    new.file_size := old.file_size;
    new.edited_at := old.edited_at;
    new.deleted_at := old.deleted_at;
    return new;
  end if;

  if new.deleted_at is not null then
    new.body := null;
    new.image := null;
    new.file_url := null;
    new.file_name := null;
    new.file_size := null;
    new.deleted_at := now();
    delete from public.message_reactions where message_id = new.id;
    return new;
  end if;

  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;

  return new;
end;
$$;

delete from public.message_reactions mr
using public.messages m
where mr.message_id = m.id
  and m.deleted_at is not null;
