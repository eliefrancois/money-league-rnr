-- Session 1: Auth + minimal profiles
-- Goal: enable signup → email confirmation → sign-in → app loads without crashing.
-- Full v1 schema (leagues, pot_ledger, sponsorship_codes, etc.) lands in Session 2.

set check_function_bodies = off;

-- =============================================================================
-- profiles
-- Minimal shape: just what app/(app)/index.tsx reads on first render.
-- Will be extended in Session 2 with eligibility, dob, state, stripe_account_id.
-- =============================================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text unique,
    full_name text,
    avatar_url text,
    is_espn_synced boolean not null default false,
    is_sleeper_synced boolean not null default false,
    is_yahoo_synced boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint username_length check (char_length(username) >= 3)
);

comment on table public.profiles is
    'User profile mirror of auth.users. Auto-created via handle_new_user trigger.';

-- =============================================================================
-- handle_new_user trigger
-- Creates a profile row whenever a new auth.users row is inserted.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name, avatar_url)
    values (
        new.id,
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'avatar_url'
    );
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

-- =============================================================================
-- updated_at trigger
-- Keeps profiles.updated_at fresh on row updates. Reusable helper.
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row
    execute function public.set_updated_at();

-- =============================================================================
-- Row-level security
-- =============================================================================

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
    on public.profiles for select
    using (true);

create policy "Users can insert their own profile"
    on public.profiles for insert
    with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
    on public.profiles for update
    using ((select auth.uid()) = id);

-- =============================================================================
-- Grants
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles to anon;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

grant execute on function public.handle_new_user() to anon, authenticated, service_role;
grant execute on function public.set_updated_at() to anon, authenticated, service_role;
