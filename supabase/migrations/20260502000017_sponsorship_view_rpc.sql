-- =============================================================================
-- Pass 2C — sponsorship view RPC
-- =============================================================================
-- Spec: docs/TECH_SPEC.md §3.11 + APP_FLOW Flow 7 "projected boost" banner.
--
-- Clients can't read `sponsorship_codes` directly (service-role only by design
-- — it carries partner contact emails and other ops-only fields). The Pot tab
-- banner needs a few numeric fields to render the projection:
--   - match_ratio       (boost = member_pot * ratio, capped at boost_max_cents)
--   - expires_at        (countdown urgency copy)
--   - min_paid_pct      (progress bar denominator)
--   - funded_at         ("credited X days ago" copy)
--   - partner_name      (banner attribution)
--
-- This SECURITY DEFINER function exposes only those fields, gated by league
-- membership: anyone linked into the league via league_members can call it.
-- Non-members get an empty result set (RLS-equivalent).

create or replace function public.get_sponsorship_view(p_league_id uuid)
returns table (
  status text,
  boost_max_cents bigint,
  match_ratio numeric,
  expires_at timestamptz,
  min_members_paid_pct numeric,
  funded_at timestamptz,
  partner_name text
)
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select
    l.sponsorship_status,
    coalesce(l.sponsorship_boost_max_cents, 0)::bigint,
    coalesce(sc.match_ratio, 1)::numeric,
    sc.expires_at,
    coalesce((sc.conditions->>'min_members_paid_pct')::numeric, 0.8),
    sc.funded_at,
    coalesce(sc.partner_name, 'Partner')
  from public.leagues l
  left join public.sponsorship_codes sc on sc.id = l.sponsorship_code_id
  where l.id = p_league_id
    and (
      l.commissioner_profile_id = (select auth.uid())
      or exists (
        select 1
        from public.league_members lm
        where lm.league_id = l.id
          and lm.linked_profile_id = (select auth.uid())
      )
    );
$$;

revoke all on function public.get_sponsorship_view(uuid) from public;
grant execute on function public.get_sponsorship_view(uuid) to authenticated;

comment on function public.get_sponsorship_view(uuid) is
  'Returns the public-safe sponsorship fields for a league. Restricted to commissioner + linked members. See app/(app)/league/[id]/index.tsx → SponsorshipPotBanner.';
