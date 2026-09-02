-- =====================================================================
-- 16 · edit and delete (unsend) messages
--
-- Edit: the sender can change a message's text after sending. `edited_at`
-- is stamped by a trigger, never trusted from the client, so an edit can't
-- hide itself by claiming it was never edited.
--
-- Delete: soft-delete only -- sets deleted_at and clears every content
-- column (body/image/file_*), so the raw content is actually gone from
-- what any query returns, not just hidden by the client. The row survives
-- so reactions/seen receipts/ordering stay consistent and other members
-- still see a "message deleted" placeholder instead of a hole in history.
-- A deleted message can never be restored (enforced in the trigger, not
-- just by convention) and can no longer be edited or reacted to.
-- =====================================================================

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.messages drop constraint if exists message_has_content;
alter table public.messages
  add constraint message_has_content
  check (
    deleted_at is not null
    or body is not null
    or image is not null
    or file_url is not null
  );

create or replace function public.stamp_message_edit()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Already deleted: nothing may change except an idempotent repeat of
  -- the same delete (deleted_at staying non-null). In particular this
  -- forbids both restoring the message AND sneaking a body edit in under
  -- cover of a "delete" call that doesn't actually touch deleted_at.
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
    return new;
  end if;

  -- Deleting now: clear every content column regardless of what the
  -- update statement's SET list included, so column grants only need to
  -- expose deleted_at to the client, not the content columns themselves.
  if new.deleted_at is not null then
    new.body := null;
    new.image := null;
    new.file_url := null;
    new.file_name := null;
    new.file_size := null;
    return new;
  end if;

  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;

  return new;
end;
$$;

create trigger on_message_update_stamp
before update on public.messages
for each row execute function public.stamp_message_edit();

create policy "author edits own messages"
on public.messages for update to authenticated
using      (sender_id = (select auth.uid()))
with check (sender_id = (select auth.uid()));

-- Defense in depth: even with the policy above, only body (edit) and
-- deleted_at (delete) are writable from a client update statement. The
-- trigger above still assigns the other content columns internally when
-- deleting -- column grants restrict the SET list, not trigger writes.
revoke update on public.messages from authenticated;
grant update (body, deleted_at) on public.messages to authenticated;

-- A deleted message can't be edited or reacted to after the fact.
drop policy if exists "react as yourself" on public.message_reactions;
create policy "react as yourself"
on public.message_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.messages m
     where m.id = message_reactions.message_id
       and m.deleted_at is null
       and public.is_conversation_member(m.conversation_id)
  )
);
