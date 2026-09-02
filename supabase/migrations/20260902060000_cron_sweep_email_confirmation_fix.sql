-- =====================================================================
-- cleanup_abandoned_passkey_signups() was matching legitimate signups
-- still waiting on email confirmation, not just abandoned WebAuthn
-- ceremonies.
--
-- signUpWithPasskey() tags passkey_bootstrap: true on the initial
-- signUp() call before it's known whether a session came back --
-- Supabase withholds the session until the confirmation link is used,
-- when confirmations are required. When it doesn't come back, the row
-- is left exactly matching this sweep's old WHERE clause (no passkey,
-- no conversation activity, created more than 10 minutes ago) even
-- though that account was never mid-ceremony: it never had a session to
-- call registerPasskey() from, and the confirmation link stays valid
-- until the user opens it, whenever that is. Deleting it out from under
-- them turned a normal "check your email" wait into a permanently
-- broken signup.
--
-- email_confirmed_at is set the moment a session actually exists for
-- that user -- immediately, for auto-confirm projects, or when the
-- confirmation link is used, for projects that require it -- so anchor
-- both the guard and the 10-minute window on it instead of created_at:
-- this sweep should only ever touch a row that did have the chance to
-- reach registerPasskey() and didn't, giving a confirmed-but-not-yet-
-- enrolled user the same 10-minute grace period from confirmation
-- rather than one already exhausted by the time they open the link.
-- =====================================================================

create or replace function public.cleanup_abandoned_passkey_signups()
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  with victims as (
    delete from auth.users u
    where coalesce((u.raw_user_meta_data->>'passkey_bootstrap')::boolean, false) = true
      and u.email_confirmed_at is not null
      and u.email_confirmed_at < now() - interval '10 minutes'
      and not exists (
        select 1 from auth.webauthn_credentials w where w.user_id = u.id
      )
      and not exists (
        select 1 from public.conversation_members cm where cm.user_id = u.id
      )
    returning u.id
  )
  select count(*) into v_count from victims;

  return v_count;
end;
$$;
