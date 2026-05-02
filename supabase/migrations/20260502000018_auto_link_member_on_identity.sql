-- =============================================================================
-- Auto-link league_members on platform_identity insert
-- =============================================================================
-- Spec: Closes the gap where a member who signs up AFTER the commissioner has
-- imported their Sleeper league had to re-run sleeper-link before their
-- profile was joined to the existing league_members row.
--
-- Now: the moment a user verifies a fantasy account (via the
-- platform_identities upsert in sleeper-import-league, or any future
-- account-linking flow), this trigger backfills `linked_profile_id` on every
-- existing `league_members` row that matches `(platform, external_user_id)`,
-- and promotes them to `commissioner_profile_id` on each league where they
-- are the platform-marked owner.
--
-- We only fire on INSERT for v1: handle changes to external_user_id (rare —
-- changing your Sleeper handle) are ignored to keep the trigger predictable.
-- The legacy explicit-link path inside sleeper-import-league still works,
-- so this is purely additive — anyone who used the old path is already
-- linked, and the trigger is a no-op for them.

create or replace function public.auto_link_members_for_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Backfill linked_profile_id on every matching unlinked member row.
  -- Filters by leagues.platform so the same external_user_id under a
  -- different platform (e.g. ESPN userId that happens to collide) isn't
  -- mis-linked.
  update public.league_members lm
  set linked_profile_id = new.profile_id
  from public.leagues l
  where lm.league_id = l.id
    and l.platform = new.platform
    and lm.external_user_id = new.external_user_id
    and lm.linked_profile_id is null;

  -- Promote the user to commissioner on any league where they're the
  -- platform-marked owner and no PotKeeper commissioner profile is set yet.
  update public.leagues
  set commissioner_profile_id = new.profile_id
  where commissioner_profile_id is null
    and platform = new.platform
    and exists (
      select 1
      from public.league_members lm
      where lm.league_id = leagues.id
        and lm.linked_profile_id = new.profile_id
        and lm.is_owner = true
    );

  return new;
end;
$$;

revoke all on function public.auto_link_members_for_identity() from public;

drop trigger if exists platform_identities_auto_link on public.platform_identities;
create trigger platform_identities_auto_link
  after insert on public.platform_identities
  for each row execute function public.auto_link_members_for_identity();

comment on function public.auto_link_members_for_identity() is
  'Trigger: when a user verifies a fantasy account, auto-link them to all matching league_members rows that were created before they signed up.';
