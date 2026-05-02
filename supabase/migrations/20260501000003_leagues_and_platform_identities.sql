-- Session 2 (Sleeper-first): platform-agnostic league import schema.
--
-- Three new tables:
--   1. platform_identities  — profile ↔ platform user_id link (e.g. "you on Sleeper")
--   2. leagues              — platform-agnostic league metadata
--   3. league_members       — platform-side roster (NOT PotKeeper users; see linked_profile_id)
--
-- Future tables (Session 3+): pot_ledger, sponsorship_codes, join_requests, etc.
--
-- Design notes:
--   - All external IDs are text. Sleeper uses 19-digit ints, ESPN uses short ints,
--     Yahoo uses dotted strings. Text handles all three.
--   - league_members is the platform's view (e.g. all 13 Sleeper users in Last Call Dynasty),
--     decoupled from PotKeeper signups. linked_profile_id ties them together when a member
--     joins PotKeeper.
--   - Commissioner identification is two-step: the platform tells us via is_owner flag
--     (Sleeper) or similar. Once a PotKeeper profile links to a league_member row marked
--     is_owner, we copy that profile_id into leagues.commissioner_profile_id.

set check_function_bodies = off;

-- =============================================================================
-- platform_platform enum
-- Matches Sleeper, ESPN, Yahoo. League type "draftgroup" reserved for FF Expo events.
-- =============================================================================

do $$ begin
    create type public.platform as enum ('sleeper', 'espn', 'yahoo');
exception
    when duplicate_object then null;
end $$;

-- =============================================================================
-- platform_identities
-- Cache of "profile X is user Y on platform Z". One row per (profile, platform).
-- Lets us resolve a Sleeper user_id back to a PotKeeper profile cheaply.
-- =============================================================================

create table if not exists public.platform_identities (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    platform public.platform not null,
    external_user_id text not null,
    external_username text,
    external_display_name text,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (profile_id, platform),
    unique (platform, external_user_id)
);

comment on table public.platform_identities is
    'Maps PotKeeper profiles to fantasy platform user IDs. One row per (profile, platform).';

create index platform_identities_external_lookup_idx
    on public.platform_identities (platform, external_user_id);

drop trigger if exists platform_identities_set_updated_at on public.platform_identities;
create trigger platform_identities_set_updated_at
    before update on public.platform_identities
    for each row
    execute function public.set_updated_at();

alter table public.platform_identities enable row level security;

create policy "Users see own identities"
    on public.platform_identities for select
    using ((select auth.uid()) = profile_id);

create policy "Users insert own identities"
    on public.platform_identities for insert
    with check ((select auth.uid()) = profile_id);

create policy "Users update own identities"
    on public.platform_identities for update
    using ((select auth.uid()) = profile_id);

create policy "Users delete own identities"
    on public.platform_identities for delete
    using ((select auth.uid()) = profile_id);

-- =============================================================================
-- leagues
-- Platform-agnostic league metadata. One row per imported league.
-- Buy-in / commissioner fields nullable until claimed/configured.
-- =============================================================================

create table if not exists public.leagues (
    id uuid primary key default gen_random_uuid(),
    platform public.platform not null,
    external_league_id text not null,
    name text not null,
    season text not null,
    status text,
    total_rosters integer,

    -- Commissioner flow: the platform tells us who's commissioner via league_members.is_owner.
    -- commissioner_external_user_id mirrors that. commissioner_profile_id is set later when
    -- the commissioner themselves links their PotKeeper account to the league.
    commissioner_external_user_id text,
    commissioner_profile_id uuid references public.profiles(id) on delete set null,

    -- Buy-in is null until the commissioner sets it. Stored in cents to avoid float drama.
    buy_in_cents integer,

    -- The PotKeeper user who first imported this league. Doesn't imply commissioner status.
    imported_by uuid references public.profiles(id) on delete set null,

    -- Full platform response for debugging and future-proofing. Don't query against this.
    import_metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (platform, external_league_id, season)
);

comment on table public.leagues is
    'Imported fantasy leagues (one row per league/season). Platform-agnostic.';

create index leagues_platform_external_idx
    on public.leagues (platform, external_league_id);

create index leagues_imported_by_idx
    on public.leagues (imported_by);

drop trigger if exists leagues_set_updated_at on public.leagues;
create trigger leagues_set_updated_at
    before update on public.leagues
    for each row
    execute function public.set_updated_at();

alter table public.leagues enable row level security;

-- SELECT: visible to anyone whose linked profile appears in league_members for this league.
-- Defined after league_members table below to avoid forward reference.

-- INSERT: any authenticated user can import (we trust them; bad data is recoverable).
-- The actual writing happens via edge function with service_role for atomicity, but
-- this policy lets us do client-side reads of newly-inserted rows without re-fetching.
create policy "Authenticated users can import leagues"
    on public.leagues for insert
    to authenticated
    with check ((select auth.uid()) = imported_by);

-- UPDATE: only the commissioner can change buy_in, etc.
create policy "Commissioner can update league"
    on public.leagues for update
    using ((select auth.uid()) = commissioner_profile_id);

-- =============================================================================
-- league_members
-- Platform-side roster (e.g. all 13 users in a Sleeper league).
-- linked_profile_id ties a member to a PotKeeper profile when they join.
-- =============================================================================

create table if not exists public.league_members (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id) on delete cascade,
    external_user_id text not null,
    external_username text,
    external_display_name text,
    avatar_url text,

    -- Sleeper's "is_owner: true" — set on commissioner row. Multiple commissioners possible.
    -- NULL or false both mean "not commissioner" (Sleeper returns null for most rows).
    is_owner boolean not null default false,

    -- Roster data (Sleeper-shaped; ESPN/Yahoo populate equivalents).
    roster_id integer,
    team_name text,

    -- Set when this league_member's external_user_id matches a platform_identity.
    -- Use the public.link_member_to_profile() helper rather than updating directly.
    linked_profile_id uuid references public.profiles(id) on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (league_id, external_user_id)
);

comment on table public.league_members is
    'Platform-side league roster. linked_profile_id ties to PotKeeper profile when joined.';

create index league_members_league_idx on public.league_members (league_id);
create index league_members_linked_profile_idx on public.league_members (linked_profile_id);
create index league_members_external_user_idx
    on public.league_members (external_user_id);

drop trigger if exists league_members_set_updated_at on public.league_members;
create trigger league_members_set_updated_at
    before update on public.league_members
    for each row
    execute function public.set_updated_at();

alter table public.league_members enable row level security;

-- SELECT: any league member (linked to any league_member row in this league) can see all rows.
create policy "Members can see fellow members"
    on public.league_members for select
    using (
        exists (
            select 1 from public.league_members lm
            where lm.league_id = league_members.league_id
              and lm.linked_profile_id = (select auth.uid())
        )
    );

-- INSERT: only via service_role (edge function). No client-side policy.

-- UPDATE: members can update their own row (e.g. to set linked_profile_id).
create policy "Members can update own row"
    on public.league_members for update
    using ((select auth.uid()) = linked_profile_id);

-- =============================================================================
-- leagues SELECT policy (now that league_members exists)
-- =============================================================================

create policy "Members can see their leagues"
    on public.leagues for select
    using (
        exists (
            select 1 from public.league_members lm
            where lm.league_id = leagues.id
              and lm.linked_profile_id = (select auth.uid())
        )
        or imported_by = (select auth.uid())
    );

-- =============================================================================
-- Helper: link_member_to_profile
-- Atomically links a league_member row to a profile, and if that member is the
-- commissioner, promotes commissioner_profile_id on the leagues row.
-- Called from edge function or client when user claims a roster.
-- =============================================================================

create or replace function public.link_member_to_profile(
    p_league_member_id uuid,
    p_profile_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_league_id uuid;
    v_is_owner boolean;
begin
    -- Verify caller owns this profile
    if (select auth.uid()) <> p_profile_id then
        raise exception 'Cannot link member to another user''s profile';
    end if;

    update public.league_members
    set linked_profile_id = p_profile_id
    where id = p_league_member_id
    returning league_id, is_owner into v_league_id, v_is_owner;

    if v_league_id is null then
        raise exception 'League member not found: %', p_league_member_id;
    end if;

    -- If this member is the platform-marked commissioner, also set commissioner_profile_id
    if v_is_owner then
        update public.leagues
        set commissioner_profile_id = p_profile_id
        where id = v_league_id
          and commissioner_profile_id is null;
    end if;
end;
$$;

grant execute on function public.link_member_to_profile(uuid, uuid)
    to authenticated, service_role;

-- =============================================================================
-- Grants
-- =============================================================================

grant select on public.platform_identities to authenticated;
grant insert, update, delete on public.platform_identities to authenticated;
grant all on public.platform_identities to service_role;

grant select on public.leagues to authenticated;
grant insert, update on public.leagues to authenticated;
grant all on public.leagues to service_role;

grant select, update on public.league_members to authenticated;
grant all on public.league_members to service_role;
