-- =====================================================================
-- pg_cron was enabled directly on production ahead of the cron job added
-- in 20260902020000_cleanup_abandoned_passkey_signups.sql, so a fresh
-- environment following this migration history alone would fail to
-- schedule that job. Tracking the extension here makes `supabase db push`
-- reproducible from scratch; idempotent, so it is a no-op where it is
-- already enabled.
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
