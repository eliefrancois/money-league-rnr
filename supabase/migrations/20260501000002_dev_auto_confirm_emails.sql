-- ⚠️ DEV-ONLY: auto-confirms email addresses so signups are immediately usable.
--
-- WHY THIS EXISTS:
-- Until we've configured a custom SMTP provider (post-LLC, pre-launch), having
-- email-confirmation gates in dev means we'd have to dig out the confirmation
-- link from the Supabase logs every time we test signup. Auto-confirm bypasses
-- that.
--
-- BEFORE GOING TO PRODUCTION:
-- 1. Drop this trigger (or guard with: where current_setting('app.environment') = 'dev')
-- 2. Re-enable email confirmations in the Supabase dashboard
-- 3. Configure a transactional email provider (e.g. Resend, Postmark)
-- 4. Verify the confirmation link in onboarding flow per APP_FLOW.md §1
--
-- TRACKED IN: TECH_SPEC.md §10 Security & Compliance — pre-launch checklist

create or replace function public.dev_auto_confirm_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
    return new;
end;
$$;

drop trigger if exists dev_auto_confirm_email_trigger on auth.users;
create trigger dev_auto_confirm_email_trigger
    before insert on auth.users
    for each row
    execute function public.dev_auto_confirm_email();

comment on function public.dev_auto_confirm_email() is
    'DEV-ONLY: auto-sets email_confirmed_at on signup. Remove before production.';
