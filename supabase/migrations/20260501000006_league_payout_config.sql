-- Session 3: Buy-in setup flow for commissioners.
-- Adds the three pieces of state Screen 3.2 (`APP_FLOW.md`) writes:
--   1. payout_split  — JSON shape: { "preset": text, "ranks": { rank: percent } }
--   2. fee_payer     — who absorbs the 2.5% PotKeeper platform fee
--   3. buyin_configured_at — clean "is this league set up?" check
--
-- We don't enforce ranks-sum-to-100 in Postgres (validation lives in the app
-- so we can show inline UX). The check constraint on fee_payer guards us
-- against silent typos.

alter table public.leagues
    add column if not exists payout_split jsonb,
    add column if not exists fee_payer text
        check (fee_payer in ('members', 'commissioner')),
    add column if not exists buyin_configured_at timestamptz;

comment on column public.leagues.payout_split is
    'Rank-to-percentage map plus preset name. Example: {"preset":"standard","ranks":{"1":60,"2":30,"3":10}}. Null until commissioner configures.';
comment on column public.leagues.fee_payer is
    'Who covers the 2.5% PotKeeper platform fee: ''members'' (default — added on top of buy-in) or ''commissioner'' (deducted from pot).';
comment on column public.leagues.buyin_configured_at is
    'Set by the buy-in setup flow once buy_in_cents, payout_split, and fee_payer are all populated. Used to show "Set up the pot" CTA only when null.';

-- The "Commissioner can update league" RLS policy (created in migration 0003)
-- already covers updates to these new columns since it gates on
-- commissioner_profile_id, not specific column names.
