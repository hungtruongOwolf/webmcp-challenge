-- =====================================================================
-- stamp_message_edit() already forces edited_at server-side so a client
-- can never fake an edit timestamp, but it left deleted_at trusted as
-- whatever the client sent: a repeat delete_message call could overwrite
-- the original deletion time, and the first delete could be backdated or
-- postdated. Mirror the edited_at treatment for deleted_at too.
--
-- Separately, "change your own reaction" (the UPDATE policy on
-- message_reactions) never got the deleted_at guard that "react as
-- yourself" (the INSERT policy) has. An upsert's ON CONFLICT DO UPDATE
-- path is governed by the UPDATE policy, not the INSERT policy's WITH
-- CHECK, so changing (not adding) a reaction on a deleted message was
-- still allowed. Add the same guard to the UPDATE policy.
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
    return new;
  end if;

  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;

  return new;
end;
$$;

drop policy "change your own reaction" on public.message_reactions;

create policy "change your own reaction"
on public.message_reactions for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.messages m
     where m.id = message_reactions.message_id
       and m.deleted_at is null
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.messages m
     where m.id = message_reactions.message_id
       and m.deleted_at is null
  )
);
