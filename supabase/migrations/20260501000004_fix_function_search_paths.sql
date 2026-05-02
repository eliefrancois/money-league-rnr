-- Tighten function definitions surfaced by Supabase security advisor:
--   1. set_updated_at had a mutable search_path
--   2. trigger-only functions (handle_new_user, dev_auto_confirm_email, set_updated_at)
--      shouldn't be RPC-callable by anon/authenticated. Revoke EXECUTE except from
--      service_role (where the triggers run).
--
-- link_member_to_profile is intentionally RPC-callable; we leave its grants alone.

-- 1. Pin search_path on set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- 2. Revoke RPC EXECUTE from public-facing roles for trigger-only functions
revoke execute on function public.set_updated_at() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.dev_auto_confirm_email() from anon, authenticated, public;
