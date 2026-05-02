-- Session 4: Stripe Connect Express onboarding (Flow 7).
--
-- Adds the columns we need to track a commissioner's Connect account
-- lifecycle. We store a *minimal* mirror of Stripe's authoritative state —
-- just enough to gate UI without round-tripping to the Stripe API on every
-- render. The Edge Functions stripe-create-connect-account and
-- stripe-account-status are responsible for keeping these in sync.
--
-- See TECH_SPEC.md §4 (Payments) and §10.4 (Tax reporting). Webhook-driven
-- live sync is intentionally deferred to the next slice; for v1 we
-- refresh on demand when the user lands on the wallet screen.

alter table public.profiles
    add column if not exists stripe_account_id text unique,
    add column if not exists stripe_charges_enabled boolean not null default false,
    add column if not exists stripe_payouts_enabled boolean not null default false,
    add column if not exists stripe_details_submitted boolean not null default false,
    add column if not exists stripe_requirements jsonb,
    add column if not exists stripe_account_updated_at timestamptz;

comment on column public.profiles.stripe_account_id is
    'Stripe Connect Express account ID (acct_…). Owns the payout side of KYC + bank account.';
comment on column public.profiles.stripe_charges_enabled is
    'Mirror of Stripe account.charges_enabled. We never charge to a Connect account directly (separate-charges-and-transfers model) so this is informational.';
comment on column public.profiles.stripe_payouts_enabled is
    'Mirror of Stripe account.payouts_enabled. True = ready to receive transfers from PotKeeper to bank.';
comment on column public.profiles.stripe_details_submitted is
    'Mirror of Stripe account.details_submitted. True after the user finishes onboarding even if requirements remain.';
comment on column public.profiles.stripe_requirements is
    'Stripe account.requirements blob (currently_due, eventually_due, past_due, disabled_reason).';
comment on column public.profiles.stripe_account_updated_at is
    'When we last synced from Stripe (via stripe-account-status edge function or webhook).';
