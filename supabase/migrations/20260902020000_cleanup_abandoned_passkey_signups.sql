-- =====================================================================
-- 18 · server-side sweep for abandoned passkey signups
--
-- delete_unenrolled_passkey_signup() (see the previous migration) only
-- runs client-side, from inside the still-live session that started the
-- signup. If the user closes the tab or loses network while the WebAuthn
-- prompt is up -- neither cancelling nor completing it -- that client-side
-- rollback never gets a chance to run, and the account is orphaned for
-- good once its 10-minute self-cleanup window closes.
--
-- This is the backstop: a pg_cron job with no session context, so it can't
-- rely on auth.uid() to scope itself the way the per-user RPC does.
-- Instead it's scoped by an explicit marker -- signUpWithPasskey() now
-- tags user_metadata with passkey_bootstrap: true at signup, a flag a
-- real password-signup account never carries. Combined with the same
-- "no passkey, no conversation activity, still within the eligibility
-- window" shape as the per-user RPC, this can only ever touch an account
-- that is unambiguously an abandoned bootstrap signup -- never a real
-- user who simply hasn't done anything yet, since those were never
-- tagged in the first place.
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
      and u.created_at < now() - interval '10 minutes'
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

-- Admin-only: this crosses user boundaries (no auth.uid() scoping), so it
-- must never be callable by anon or authenticated clients -- only the
-- scheduled job below, running as the function owner.
revoke all on function public.cleanup_abandoned_passkey_signups() from public, anon, authenticated;

select cron.schedule(
  'cleanup-abandoned-passkey-signups',
  '*/15 * * * *',
  $$select public.cleanup_abandoned_passkey_signups();$$
);
