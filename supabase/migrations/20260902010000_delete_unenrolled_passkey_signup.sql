-- =====================================================================
-- 17 · clean up an abandoned passkey-only signup
--
-- signUpWithPasskey() has no choice but to create the auth.users row
-- before it can register a passkey (Supabase's passkey beta requires an
-- existing session; there is no signUpWithPasskey on their side, and
-- anonymous sign-ins are disabled on this project). If the WebAuthn
-- ceremony is then cancelled or fails, that leaves a real row behind with
-- a random password nobody knows and no passkey -- a dead end that also
-- permanently blocks the same email from trying again (user_already_exists).
--
-- auth.admin.deleteUser() would be the normal fix, but it needs the
-- service-role key, which this project's client bundle never carries.
-- This RPC does the equivalent from inside Postgres instead, scoped as
-- tightly as possible so it can never be used as a general "delete my
-- account" button: it only ever targets the caller's own row, and only
-- when that row was created moments ago, has no enrolled passkey, and
-- has never joined a conversation. Anything outside that narrow shape
-- (a real account, however new) is refused.
-- =====================================================================

create or replace function public.delete_unenrolled_passkey_signup()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_created_at timestamptz;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select created_at into v_created_at from auth.users where id = v_me;

  if v_created_at is null or v_created_at < now() - interval '10 minutes' then
    raise exception 'account is not eligible for automatic cleanup';
  end if;

  if exists (select 1 from auth.webauthn_credentials where user_id = v_me) then
    raise exception 'account has an enrolled passkey, refusing to delete';
  end if;

  if exists (select 1 from public.conversation_members where user_id = v_me) then
    raise exception 'account has activity, refusing to delete';
  end if;

  delete from auth.users where id = v_me;
end;
$$;

revoke all on function public.delete_unenrolled_passkey_signup() from public, anon;
grant execute on function public.delete_unenrolled_passkey_signup() to authenticated;
