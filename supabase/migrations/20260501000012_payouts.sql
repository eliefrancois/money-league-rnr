-- =============================================================================
-- Migration: payouts table (Sprint 4 Pass 2 — manual payout engine)
-- =============================================================================
--
-- Establishes the recipient-side state machine for league payouts. Each row
-- represents one rank-or-charity slot in a league's final payout, scoped to
-- a specific final standings_snapshot. The Stripe `transfers.create()` call
-- writes to pot_ledger (canonical money log) AND flips this row's status
-- (recipient-facing UI state).
--
-- Why a separate table when pot_ledger already exists?
--   - pot_ledger is canonical for money movement but is a flat append-only
--     log; reads like "did rank 2 get paid?" require joining/aggregating.
--   - payouts is the per-recipient state we render directly: paid /
--     processing / waiting_on_connect / failed. RLS-scoped so members see
--     just their league's payout state.
--   - Idempotency: UNIQUE(league_id, snapshot_id, rank) prevents the
--     commissioner from double-triggering payouts for the same standings
--     snapshot, even across retries.
--
-- Spec: docs/TECH_SPEC.md §8 (Payout Engine).

create table if not exists public.payouts (
  id bigint generated always as identity primary key,

  league_id uuid not null references public.leagues(id) on delete restrict,
  snapshot_id bigint not null references public.standings_snapshots(id) on delete restrict,

  -- Recipient identity. For winners we point at both the linked profile
  -- (canonical PotKeeper user) and the league_member (so we can render
  -- their Sleeper team name even if they unlink later). For charity slots
  -- both are NULL and `recipient_kind='charity'` carries the meaning.
  recipient_kind text not null check (recipient_kind in ('winner', 'charity'))
    default 'winner',
  profile_id uuid references public.profiles(id),
  league_member_id uuid references public.league_members(id),

  -- Position in the payout split. NULL for charity (charity isn't ranked).
  rank int check (rank is null or rank > 0),

  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD',

  status text not null default 'pending'
    check (status in (
      'pending',              -- queued, transfer.create not yet attempted
      'waiting_on_connect',   -- recipient lacks a verified Connect account
      'processing',           -- transfer.create succeeded, awaiting webhook confirmation
      'paid',                 -- transfer settled successfully
      'failed',               -- transfer.failed event landed
      'reversed'              -- transfer reversed (chargeback / fraud / manual)
    )),

  -- Stripe handles. UNIQUE on transfer_id catches webhook replays of the
  -- same transfer event from updating multiple rows.
  stripe_transfer_id text unique,
  stripe_destination_account text,  -- snapshot of Connect account at trigger time
  failure_reason text,

  initiated_by uuid references public.profiles(id),  -- the commissioner who fired
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  failed_at timestamptz,

  -- One payout per (league, snapshot, rank). Charity uses rank=NULL with a
  -- partial unique index defined below so multiple winners (rank=1, rank=2)
  -- can coexist while still preventing duplicate triggers.
  constraint payouts_unique_winner_slot unique (league_id, snapshot_id, rank)
);

-- Charity slots use rank=NULL which the unique constraint above doesn't
-- cover (NULL != NULL in unique constraints). Add a partial unique index
-- so we still can't double-create the charity row.
create unique index if not exists idx_payouts_unique_charity
  on public.payouts(league_id, snapshot_id)
  where recipient_kind = 'charity';

create index if not exists idx_payouts_league on public.payouts(league_id);
create index if not exists idx_payouts_profile on public.payouts(profile_id);
create index if not exists idx_payouts_status on public.payouts(status);
create index if not exists idx_payouts_waiting_on_connect
  on public.payouts(profile_id)
  where status = 'waiting_on_connect';

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
--
-- League members can view their league's payouts (so the Pot tab can
-- render PayoutStatusList for everyone). Recipients can also see rows
-- targeted at them across leagues (the wallet "you have winnings waiting"
-- banner).
--
-- All writes go through service-role-backed Edge Functions (trigger-payout,
-- stripe-webhook). No client INSERT/UPDATE/DELETE policies.

alter table public.payouts enable row level security;

drop policy if exists "League members can view their league's payouts" on public.payouts;
create policy "League members can view their league's payouts"
  on public.payouts
  for select
  to authenticated
  using (public.is_league_member(league_id));

drop policy if exists "Recipients can view their own payouts" on public.payouts;
create policy "Recipients can view their own payouts"
  on public.payouts
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

comment on table public.payouts is
  'One row per rank-or-charity slot in a league payout. Canonical recipient-side state machine; pot_ledger remains canonical for amounts.';
