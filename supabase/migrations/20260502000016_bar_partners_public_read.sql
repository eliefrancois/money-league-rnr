-- Bar partners are display-only marketing data (Pass 2C). Allow any
-- authenticated user to read rows so `leagues` → `bar_partners` embeds work
-- for the League Detail banner. Writes remain service-role–only (no INSERT policy).

alter table public.bar_partners enable row level security;

drop policy if exists "Anyone can read bar partners" on public.bar_partners;

create policy "Anyone can read bar partners"
  on public.bar_partners
  for select
  to anon, authenticated
  using (true);
