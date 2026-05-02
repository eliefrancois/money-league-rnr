-- =============================================================================
-- Migration: pot_ledger + league_members.payment_status
-- =============================================================================
--
-- Sprint 3 Pass 1 (money-in foundation). Establishes:
--
--   1. pot_ledger      — single source of truth for all money movement
--                        in a league pot. Every dollar in/out has a row.
--   2. league_pot_balance MV — derived available + reserved balance
--                              per league for fast UI reads.
--   3. league_members.payment_status — coarse "have they paid?" flag
--                                      so UI can show "Pay buy-in" /
--                                      "Paid ✓" without joining
--                                      the ledger every render.
--
-- Spec: docs/TECH_SPEC.md §3.3 (pot_ledger) — adapted to uuid FKs since
-- our existing leagues/league_members tables already use uuid (the spec
-- was written before that decision was nailed down).

create table if not exists public.pot_ledger (
  id bigint generated always as identity primary key,
  league_id uuid not null references public.leagues(id) on delete restrict,
  member_id uuid references public.profiles(id),  -- NULL for charity / fees / sponsorship
  type text not null check (type in (
    'buy_in_paid',              -- member paid into pot
    'sponsorship_credit',       -- PotKeeper-funded boost via sponsorship code (Phase 0.75)
    'platform_fee',             -- our 2.5% taken at payout
    'stripe_processing_fee',    -- pass-through fee at buy-in
    'payout_winner',            -- transfer to winning member
    'payout_charity',           -- transfer to charity partner
    'reserve_held',             -- 5% holdback at payout time
    'reserve_released',         -- holdback released after 30d
    'refund_full',              -- full refund (member removed pre-season)
    'refund_partial',           -- prorated refund (member removed mid-season)
    'chargeback',               -- buyer disputed the charge
    'adjustment'                -- manual reconciliation, requires audit_reason
  )),
  amount_cents bigint not null check (amount_cents > 0),  -- always positive; sign implied by type
  currency text not null default 'USD',
  stripe_event_id text unique,                             -- idempotency key for webhook replay
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  stripe_charge_id text,
  audit_reason text,                                       -- required for type='adjustment' (enforced in code)
  created_by uuid references public.profiles(id),          -- who triggered (NULL for system/webhook)
  created_at timestamptz not null default now()
);

create index if not exists idx_pot_ledger_league on public.pot_ledger(league_id);
create index if not exists idx_pot_ledger_member on public.pot_ledger(member_id);
create index if not exists idx_pot_ledger_stripe_event on public.pot_ledger(stripe_event_id);
create index if not exists idx_pot_ledger_created_at on public.pot_ledger(created_at desc);

-- ----------------------------------------------------------------------------
-- league_pot_balance — materialized view of net pot per league.
--
-- Reads stay fast (no scanning the ledger on every render). Refreshed
-- after any ledger write (the webhook does this, the buy-in setup
-- doesn't need to since it doesn't write money rows).
-- ----------------------------------------------------------------------------

create materialized view if not exists public.league_pot_balance as
select
  league_id,
  coalesce(sum(case when type in ('buy_in_paid', 'sponsorship_credit', 'reserve_released') then amount_cents else 0 end), 0)
    - coalesce(sum(case when type in ('payout_winner', 'payout_charity', 'platform_fee', 'stripe_processing_fee', 'refund_full', 'refund_partial', 'chargeback', 'reserve_held') then amount_cents else 0 end), 0)
    as available_cents,
  coalesce(sum(case when type = 'reserve_held' then amount_cents else 0 end), 0)
    - coalesce(sum(case when type = 'reserve_released' then amount_cents else 0 end), 0)
    as reserve_cents,
  coalesce(sum(case when type = 'sponsorship_credit' then amount_cents else 0 end), 0)
    as sponsorship_credited_cents,
  coalesce(sum(case when type = 'buy_in_paid' then amount_cents else 0 end), 0)
    as member_paid_cents
from public.pot_ledger
group by league_id;

create unique index if not exists idx_league_pot_balance_league
  on public.league_pot_balance(league_id);

-- ----------------------------------------------------------------------------
-- RLS for pot_ledger
--
-- Members of the league can SELECT rows for their league (so the Pot
-- tab on league detail can render a transaction list). Nobody can
-- INSERT/UPDATE/DELETE through PostgREST — only the service role
-- (used by the Stripe webhook) writes here.
-- ----------------------------------------------------------------------------

alter table public.pot_ledger enable row level security;

drop policy if exists "League members can view their league's ledger" on public.pot_ledger;
create policy "League members can view their league's ledger"
  on public.pot_ledger
  for select
  to authenticated
  using (public.is_league_member(league_id));

-- No INSERT/UPDATE/DELETE policies — service role bypasses RLS for
-- webhook-driven writes. Direct client writes are forbidden by design.

-- ----------------------------------------------------------------------------
-- league_members.payment_status
--
-- Coarse "where in the buy-in lifecycle is this member" flag. The
-- ledger is canonical for amounts; this column is the indexable
-- "is this member paid?" signal the league detail screen reads.
-- ----------------------------------------------------------------------------

alter table public.league_members
  add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'paid', 'refunded'));

create index if not exists idx_league_members_payment_status
  on public.league_members(league_id, payment_status);

-- ----------------------------------------------------------------------------
-- Helper: refresh the materialized view after a ledger write.
--
-- Called by the Stripe webhook after each successful insert. Concurrent
-- refresh keeps reads available during refresh.
-- ----------------------------------------------------------------------------

create or replace function public.refresh_league_pot_balance()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently public.league_pot_balance;
$$;

-- Service role only — the function modifies the MV which has no RLS.
revoke execute on function public.refresh_league_pot_balance() from public;
revoke execute on function public.refresh_league_pot_balance() from authenticated;
revoke execute on function public.refresh_league_pot_balance() from anon;
