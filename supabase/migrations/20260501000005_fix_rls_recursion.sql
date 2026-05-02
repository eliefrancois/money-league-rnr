-- Fix: "infinite recursion detected in policy for relation league_members"
--
-- The original league_members SELECT policy did:
--   USING (EXISTS (SELECT 1 FROM league_members WHERE ... = auth.uid()))
-- which re-triggers itself when Postgres evaluates RLS on the inner query.
--
-- Fix: hoist the membership check into a SECURITY DEFINER function. Functions
-- with SECURITY DEFINER bypass RLS on tables they read, so the inner query
-- doesn't re-enter the policy.
--
-- Apply the same indirection to the leagues SELECT policy, which had the same
-- league_members lookup baked in (still recurses transitively when reading
-- leagues, because the leagues policy queries league_members which then
-- triggers the league_members policy).

-- 1. Helper function: am I a member of this league?
create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members
    where league_id = p_league_id
      and linked_profile_id = auth.uid()
  );
$$;

-- Lock down the function (only authenticated callers; trigger functions don't
-- need to call it). service_role retains EXECUTE via default ownership.
revoke execute on function public.is_league_member(uuid) from public, anon;
grant execute on function public.is_league_member(uuid) to authenticated;

-- 2. Replace recursive league_members policy
drop policy if exists "Members can see fellow members" on public.league_members;

create policy "Members can see fellow members"
    on public.league_members for select
    using (public.is_league_member(league_id));

-- 3. Replace recursive leagues policy with the same function call
drop policy if exists "Members can see their leagues" on public.leagues;

create policy "Members can see their leagues"
    on public.leagues for select
    using (
        public.is_league_member(id) or imported_by = (select auth.uid())
    );
