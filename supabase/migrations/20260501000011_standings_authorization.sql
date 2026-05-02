-- ============================================================================
-- standings_authorizations + leagues authorization-window columns
--
-- Sprint 4 Pass 1. The 48-72hr window where members confirm or dispute the
-- final standings before payouts fire (APP_FLOW Screen 8.2).
--
-- Lifecycle:
--   1. Standings sync detects is_final=true on the latest snapshot.
--   2. Commissioner taps "Open authorization window" on the Pot tab
--      (start-authorization-window edge function).
--   3. Window columns are stamped on leagues. We seed one
--      standings_authorizations row per linked member with status='pending'.
--   4. Each linked member opens Screen 8.2 and votes via
--      submit-authorization-vote: 'approved' or 'disputed' (with reason).
--   5. When all linked members approve → authorization_status='closed_authorized'.
--      If anyone disputes → 'closed_disputed' (frozen; Pass 2 handles
--      resolution).
--   6. (Pass 2) Auto-firing payouts on close + dispute resolution flow + push
--      notifications.
--
-- Spec: docs/APP_FLOW.md Flow 8 + docs/TECH_SPEC.md §12 Sprint 4.
-- ============================================================================

set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- leagues — authorization window columns
-- ----------------------------------------------------------------------------
--
-- authorization_status drives the league detail UI:
--   'not_started'       — default; not at end-of-season yet
--   'open'              — window active; members are voting
--   'closed_authorized' — all approvals in; payout engine is unblocked
--   'closed_disputed'   — at least one dispute; frozen until commissioner
--                         resolution (Pass 2)

alter table public.leagues
  add column if not exists authorization_window_started_at timestamptz,
  add column if not exists authorization_window_closes_at timestamptz,
  add column if not exists authorization_status text not null default 'not_started';

comment on column public.leagues.authorization_status is
  '"not_started" | "open" | "closed_authorized" | "closed_disputed". Drives Pot tab CTA + cross-tab banner.';
comment on column public.leagues.authorization_window_closes_at is
  'When the 48-72hr authorization window closes. Read by Screen 8.2 countdown banner.';

-- Lookup: "any league with an open window" — small set, but indexed so the
-- (eventual) cron that auto-closes windows on expiry has a cheap query.
create index if not exists idx_leagues_auth_open
  on public.leagues (authorization_window_closes_at)
  where authorization_status = 'open';

-- ----------------------------------------------------------------------------
-- standings_authorizations — one row per (snapshot, member) vote
-- ----------------------------------------------------------------------------
--
-- snapshot_id pins the vote to a specific final standings row. If the
-- commissioner ever needs to re-sync after a Sleeper correction (Pass 2 dispute
-- resolution), the new snapshot gets fresh authorization rows so we can never
-- silently re-use stale approvals against a different result.

create table if not exists public.standings_authorizations (
  id bigint generated always as identity primary key,
  league_id uuid not null references public.leagues(id) on delete cascade,
  snapshot_id bigint not null references public.standings_snapshots(id) on delete cascade,
  league_member_id uuid not null references public.league_members(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'disputed')),
  voted_at timestamptz,
  dispute_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A member can only have one active authorization row per snapshot.
  -- Re-syncing produces a new snapshot_id so the new (snapshot_id, member)
  -- pair is fresh.
  unique (snapshot_id, league_member_id)
);

comment on table public.standings_authorizations is
  'One row per (final-snapshot, linked-member) vote. Drives Screen 8.2 progress + payout gate.';
comment on column public.standings_authorizations.status is
  '"pending" | "approved" | "disputed". Disputed freezes the league until commissioner resolves (Pass 2).';
comment on column public.standings_authorizations.dispute_reason is
  'Free-text reason supplied with status=disputed. Surfaced to commissioner in resolution UI (Pass 2).';

create index if not exists idx_standings_auth_league
  on public.standings_authorizations (league_id, status);
create index if not exists idx_standings_auth_member
  on public.standings_authorizations (league_member_id);

drop trigger if exists standings_authorizations_set_updated_at on public.standings_authorizations;
create trigger standings_authorizations_set_updated_at
  before update on public.standings_authorizations
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
--
-- SELECT: any linked member of the league can read all rows for that league
-- (Screen 8.2 needs to render "10 of 12 members have authorized").
-- INSERT / UPDATE: service-role-only; the edge functions do all writes so
-- they can re-validate state machine invariants and stamp voted_at safely.
-- ----------------------------------------------------------------------------

alter table public.standings_authorizations enable row level security;

drop policy if exists "League members can read authorizations"
  on public.standings_authorizations;

create policy "League members can read authorizations"
  on public.standings_authorizations
  for select
  using (
    exists (
      select 1
      from public.league_members lm
      where lm.league_id = standings_authorizations.league_id
        and lm.linked_profile_id = (select auth.uid())
    )
  );

-- No insert/update/delete policies. PostgREST returns "permission denied"
-- for authenticated/anon, which is intentional — only service_role
-- (edge functions) can write.
