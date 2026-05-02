-- ============================================================================
-- standings_snapshots — cache + audit trail of standings pulled from Sleeper
-- (and later ESPN/Yahoo).
--
-- Every successful sync writes one row. The latest row per league is what the
-- Standings tab renders. Historic rows enable week-over-week trend arrows
-- (Pass 2) and serve as the audit trail for payout decisions (final standings
-- read from is_final=true row).
--
-- Design notes:
--   - league_id is uuid (matches existing leagues.id, deviates from the spec's
--     bigint placeholder).
--   - The normalized `standings` jsonb is what the UI reads. `raw_data` is
--     untouched API response for forensics (e.g. "what did Sleeper actually
--     return when we paid out league X?").
--   - is_final is only set when the source platform reports `status=complete`.
--     Pass 1 marks final but leaves payout authorization to Sprint 4.
--   - Pass 1 has no playoff-bracket logic. Ranks are W-L → PF tiebreaker for
--     in-season, and the source-of-truth final ranks for completed leagues
--     are deferred to Pass 2 (winners_bracket parsing).
--
-- Spec: docs/TECH_SPEC.md §3.9 (standings_snapshots) + §4.1 (Sleeper APIs).
-- ============================================================================

set check_function_bodies = off;

create table if not exists public.standings_snapshots (
  id bigint generated always as identity primary key,
  league_id uuid not null references public.leagues(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  is_final boolean not null default false,

  -- Useful denormalizations for UI rendering, all sourced from Sleeper at
  -- sync time. None of these are authoritative — the source platform always
  -- wins on rematch. They live here so the UI doesn't have to refetch
  -- league metadata to render "Week 5 of 14".
  current_week integer,
  season_status text,

  -- Normalized array of {rank, league_member_id, external_user_id, roster_id,
  -- wins, losses, ties, points_for, points_against, ...}. Read by the UI.
  standings jsonb not null,

  -- Full upstream payload for audit. Includes the rosters response, league
  -- response, and (when status=complete) the bracket responses.
  raw_data jsonb not null
);

comment on table public.standings_snapshots is
  'Cache + audit trail of standings pulled from source platform (Sleeper/ESPN/Yahoo).';
comment on column public.standings_snapshots.standings is
  'Normalized array. UI reads this. Shape: [{rank,league_member_id,external_user_id,roster_id,wins,losses,ties,points_for,points_against}].';
comment on column public.standings_snapshots.raw_data is
  'Untouched upstream API responses for forensics. Not consumed by application code.';
comment on column public.standings_snapshots.is_final is
  'TRUE only when source platform reports league.status=complete. Drives Sprint 4 payout authorization.';

-- Latest snapshot per league: very common query, deserves an index.
create index if not exists idx_standings_league_fetched
  on public.standings_snapshots (league_id, fetched_at desc);

-- Final-snapshot lookup for payout authorization (Sprint 4). Partial index
-- keeps it cheap since most rows are not final.
create index if not exists idx_standings_league_final
  on public.standings_snapshots (league_id) where is_final = true;

-- ============================================================================
-- RLS
--
-- League members (anyone with a league_members row whose linked_profile_id is
-- the caller) can SELECT snapshots for that league. INSERT/UPDATE/DELETE are
-- service-role-only — the sync-league-standings Edge Function writes these.
-- ============================================================================

alter table public.standings_snapshots enable row level security;

-- Drop and recreate to keep migrations idempotent across reruns.
drop policy if exists "League members can read standings"
  on public.standings_snapshots;

create policy "League members can read standings"
  on public.standings_snapshots
  for select
  using (
    exists (
      select 1
      from public.league_members lm
      where lm.league_id = standings_snapshots.league_id
        and lm.linked_profile_id = (select auth.uid())
    )
  );

-- No insert/update/delete policies. PostgREST returns "permission denied"
-- for the authenticated/anon roles, which is what we want — only service_role
-- (used by the edge function) can write.
