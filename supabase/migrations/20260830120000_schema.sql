-- =====================================================================
-- 01 · schema
-- Mongo documents -> relational tables. ObjectId arrays become real
-- join tables, which is what every RLS policy later hangs off.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
-- auth.users owns identity; this table owns the app-visible fields.
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text,
  image      text,
  email      text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------- conversations
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  name            text,
  is_group        boolean not null default false,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id         uuid not null references public.profiles      on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);
create index conversations_last_message_idx on public.conversations (last_message_at desc);

-- --------------------------------------------------------------- messages
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id       uuid not null references public.profiles      on delete cascade,
  body            text,
  image           text,
  created_at      timestamptz not null default now(),
  constraint message_has_content check (body is not null or image is not null)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.message_seen (
  message_id uuid not null references public.messages on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  seen_at    timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ================================================================ triggers

-- A profile row is born with every auth user. Replaces /api/register.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, image)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, 'someone@'), '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Sidebar ordering, kept in the database instead of the route handler.
create or replace function public.bump_last_message_at()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return null;
end;
$$;

create trigger on_message_bump_conversation
after insert on public.messages
for each row execute function public.bump_last_message_at();

-- =============================================================== helpers

-- The membership test every policy needs. SECURITY DEFINER on purpose:
-- calling it from a policy ON conversation_members would otherwise
-- recurse into that same policy forever.
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select exists (
    select 1
      from public.conversation_members
     where conversation_id = conv_id
       and user_id = (select auth.uid())
  );
$$;

-- Conversation creation goes through here and nowhere else, so there is
-- no INSERT policy on conversations/conversation_members at all.
-- Also absorbs the Mongo `hasEvery` find-or-create for 1:1 chats.
create or replace function public.create_conversation(
  p_member_ids uuid[],
  p_is_group   boolean default false,
  p_name       text    default null
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_other uuid;
  v_id    uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  if p_is_group then
    if p_name is null or coalesce(array_length(p_member_ids, 1), 0) < 2 then
      raise exception 'a group needs a name and at least two other members';
    end if;
  else
    v_other := p_member_ids[1];
    if v_other is null then
      raise exception 'a direct conversation needs one other member';
    end if;

    select c.id into v_id
      from public.conversations c
      join public.conversation_members a
        on a.conversation_id = c.id and a.user_id = v_me
      join public.conversation_members b
        on b.conversation_id = c.id and b.user_id = v_other
     where c.is_group = false
     limit 1;

    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.conversations (name, is_group)
  values (p_name, p_is_group)
  returning id into v_id;

  insert into public.conversation_members (conversation_id, user_id)
  select v_id, m
    from unnest(array_append(p_member_ids, v_me)) as m
  on conflict do nothing;

  return v_id;
end;
$$;

revoke execute on function public.create_conversation(uuid[], boolean, text) from anon;
