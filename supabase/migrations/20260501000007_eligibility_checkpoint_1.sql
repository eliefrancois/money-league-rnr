-- Session 3: Checkpoint 1 (signup eligibility gate).
--
-- Captures the self-declared age + state at signup. See TECH_SPEC.md §10
-- for the full three-checkpoint architecture; this migration covers
-- Checkpoint 1 only (declaration). Checkpoints 2 + 3 (Stripe billing
-- verification + webhook reconciliation) land with the buy-in payment work.
--
-- For the MVP we mark blocked accounts as `geo_status = 'suspended'` rather
-- than deleting the auth.users row. Pros: no service_role call needed from
-- client; users can later appeal/migrate to an eligible state. Cons: a
-- blocked email is "burned" (can't sign up again) until reactivated.

-- =============================================================================
-- profiles eligibility columns
-- =============================================================================

alter table public.profiles
    add column if not exists date_of_birth date,
    add column if not exists age_verified_at timestamptz,
    add column if not exists location_state text,
    add column if not exists billing_state text,
    add column if not exists geo_status text not null default 'pending'
        check (geo_status in ('pending', 'declared', 'verified', 'suspended')),
    add column if not exists ip_country text,
    add column if not exists ip_state text,
    add column if not exists setup_intent_completed_at timestamptz;

comment on column public.profiles.date_of_birth is
    'Self-declared at Checkpoint 1. Cross-verified at Stripe Connect KYC for commissioners.';
comment on column public.profiles.location_state is
    'Self-declared 2-letter US state code at Checkpoint 1. Used for restricted-state hard block.';
comment on column public.profiles.billing_state is
    'Stripe-verified billing state from SetupIntent (Checkpoint 2). Canonical when present.';
comment on column public.profiles.geo_status is
    'pending → declared (passed C1) → verified (passed C2) → suspended (failed any check).';
comment on column public.profiles.ip_state is
    'Soft signal from request IP at signup. Logged for fraud review, not blocking.';

-- =============================================================================
-- restricted_state_waitlist
-- Captures emails of users blocked at Checkpoint 1 (and later: blocked
-- invitees, blocked browse-page visitors). When a state legalizes, batch-
-- email these contacts.
-- =============================================================================

create table if not exists public.restricted_state_waitlist (
    id bigint generated always as identity primary key,
    email text not null,
    state text not null,
    ip_state text,
    notified_at timestamptz,
    source text not null default 'signup'
        check (source in ('signup', 'invite_blocked', 'browse_blocked')),
    created_at timestamptz not null default now(),
    unique (email, state)
);

comment on table public.restricted_state_waitlist is
    'Users blocked at Checkpoint 1 (or later) who opted into "notify me when available" outreach.';

create index if not exists restricted_state_waitlist_state_idx
    on public.restricted_state_waitlist (state);

alter table public.restricted_state_waitlist enable row level security;

-- INSERT is open to authenticated AND anonymous (anon) users — capture
-- happens both during signup (authenticated) and from a public landing page
-- in Phase 2 (anon). Email uniqueness handles duplicate submissions.
create policy "Anyone can join waitlist"
    on public.restricted_state_waitlist for insert
    with check (true);

-- No SELECT/UPDATE/DELETE policies — only service_role can read this table.

grant insert on public.restricted_state_waitlist to anon, authenticated;
grant all on public.restricted_state_waitlist to service_role;
