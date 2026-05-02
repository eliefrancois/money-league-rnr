-- ============================================================================
-- leagues.authorization_auto_finalized_at
--
-- Sprint 4 Pass 2B Fix B. The auto-finalize cron flips an `open` window to
-- `closed_authorized` once `authorization_window_closes_at` is in the past,
-- treating any still-`pending` votes as silent consent (the trust pitch:
-- PotKeeper auto-disburses the moment the window closes, with or without a
-- human in the loop).
--
-- We stamp a separate timestamp column rather than overloading
-- authorization_status so support / dispute UI can tell unanimously-approved
-- leagues apart from windows that timed out without any disputes — same
-- terminal status, different audit story.
--
-- Spec: docs/TECH_SPEC.md §12 Sprint 4 Pass 2B + docs/APP_FLOW.md Flow 8.
-- ============================================================================

alter table public.leagues
  add column if not exists authorization_auto_finalized_at timestamptz;

comment on column public.leagues.authorization_auto_finalized_at is
  'When the auto-finalize cron closed the authorization window without explicit votes from every linked member. NULL for unanimous-approval closes.';
