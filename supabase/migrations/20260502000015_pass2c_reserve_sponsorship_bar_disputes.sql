-- =============================================================================
-- Pass 2C — payout reserve slice, buy-in dispute counter, sponsorship, bars
-- =============================================================================
-- Spec: docs/TECH_SPEC.md §12 Pass 2C + §3.11

-- -----------------------------------------------------------------------------
-- payouts: immediate vs 5% reserve slice (unique per rank+slice)
-- -----------------------------------------------------------------------------
alter table public.payouts drop constraint if exists payouts_unique_winner_slot;

alter table public.payouts
  add column if not exists payout_slice text not null default 'immediate'
    check (payout_slice in ('immediate', 'reserve'));

alter table public.payouts
  add column if not exists scheduled_for timestamptz;

alter table public.payouts drop constraint if exists payouts_status_check;

alter table public.payouts
  add constraint payouts_status_check check (status in (
    'pending',
    'waiting_on_connect',
    'processing',
    'paid',
    'failed',
    'reversed',
    'reserved'
  ));

alter table public.payouts
  add constraint payouts_unique_winner_slot unique (league_id, snapshot_id, rank, payout_slice);

create index if not exists idx_payouts_reserved_release
  on public.payouts (league_id, scheduled_for)
  where status = 'reserved';

comment on column public.payouts.payout_slice is
  '"immediate" = paid (after Connect) at authorization close; "reserve" = 5% holdback released ~30 days later.';
comment on column public.payouts.scheduled_for is
  'Earliest datetime the release-reserves cron may transfer this row (reserve slice only).';

-- -----------------------------------------------------------------------------
-- leagues: sponsorship + bar display + buy-in dispute lock (reserve release)
-- -----------------------------------------------------------------------------
alter table public.leagues
  add column if not exists buyin_dispute_open_count integer not null default 0
    check (buyin_dispute_open_count >= 0);

comment on column public.leagues.buyin_dispute_open_count is
  'Stripe charge.dispute events not yet closed. While >0, release-reserves cron skips this league (D4.a).';

-- Bar partner (display + incentive copy only — no platform money movement in v1)
create table if not exists public.bar_partners (
  id bigint generated always as identity primary key,
  name text not null,
  city text,
  state text,
  logo_url text,
  default_incentive text,
  created_at timestamptz not null default now()
);

comment on table public.bar_partners is
  'Marketing partners. Perks are between bar and league; PotKeeper does not ledger bar incentives in v1.';

alter table public.leagues
  add column if not exists bar_partner_id bigint references public.bar_partners(id);

alter table public.leagues
  add column if not exists bar_incentive_text text;

comment on column public.leagues.bar_incentive_text is
  'Optional override for bar perk copy shown on League Detail; falls back to bar_partners.default_incentive.';

-- PotKeeper-issued sponsorship codes (GTM boosts)
create table if not exists public.sponsorship_codes (
  id bigint generated always as identity primary key,
  code text not null unique,
  boost_max_cents bigint not null check (boost_max_cents > 0),
  match_ratio numeric(8, 4) not null default 1.0 check (match_ratio >= 0 and match_ratio <= 10),
  partner_name text not null default 'Partner',
  partner_contact_email text,
  expires_at timestamptz not null,
  conditions jsonb not null default '{
    "min_members_paid_pct": 0.80,
    "min_buy_in_cents": 2500,
    "must_use_auto_payout": true,
    "season": 2026
  }'::jsonb,
  redeemed_for_league_id uuid references public.leagues(id),
  redeemed_at timestamptz,
  funded_at timestamptz,
  forfeited_at timestamptz,
  status text not null default 'issued' check (status in (
    'issued',
    'redeemed',
    'funded',
    'forfeited',
    'cancelled'
  )),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_sponsorship_codes_status on public.sponsorship_codes(status);
create index if not exists idx_sponsorship_codes_expires
  on public.sponsorship_codes(expires_at)
  where status in ('issued', 'redeemed');
create index if not exists idx_sponsorship_codes_league on public.sponsorship_codes(redeemed_for_league_id);

comment on table public.sponsorship_codes is
  'PotKeeper-funded pot boosts. Service-role only via Edge Functions; clients never read this table directly.';

alter table public.sponsorship_codes enable row level security;

alter table public.leagues
  add column if not exists sponsorship_code_id bigint references public.sponsorship_codes(id);

alter table public.leagues
  add column if not exists sponsorship_boost_max_cents bigint default 0;

alter table public.leagues
  add column if not exists sponsorship_status text not null default 'none';

alter table public.leagues drop constraint if exists leagues_sponsorship_status_check;

alter table public.leagues
  add constraint leagues_sponsorship_status_check check (sponsorship_status in (
    'none',
    'redeemed_pending',
    'funded',
    'forfeited'
  ));

comment on column public.leagues.sponsorship_status is
  'none | redeemed_pending (awaiting threshold tick) | funded | forfeited';
