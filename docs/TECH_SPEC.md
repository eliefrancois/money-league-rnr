# PotKeeper — Technical Specification

> The build artifact. Architecture, data model, integrations, accounting, security.
> Pair with `VISION.md` (the why), `APP_FLOW.md` (the UX), `BRAND.md` (the look).

---

## 1. System Overview

### Architecture (high level)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client (Expo / React Native)                │
│  Expo Router 6 + NativeWind + RNR primitives + Supabase JS SDK   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Supabase                                   │
│   Auth │ Postgres (RLS) │ Edge Functions (Deno) │ Realtime       │
│   Vault (encrypted secrets) │ Storage (avatars, logos)            │
└────────┬───────────┬────────────┬───────────────┬────────────────┘
         │           │            │               │
         ▼           ▼            ▼               ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐  ┌─────────────┐
   │ Sleeper  │ │ ESPN API │ │ Yahoo API│  │   Stripe    │
   │ (public) │ │ (cookie) │ │  (OAuth) │  │  Connect    │
   └──────────┘ └──────────┘ └──────────┘  └─────────────┘
```

### Components by responsibility

| Component | Owns |
|---|---|
| Mobile client | UI, state, optimistic updates, deep linking, push registration |
| Supabase Auth | Identity, sessions, JWT |
| Supabase Postgres | Source of truth for users, leagues, members, ledger |
| Supabase Edge Functions (Deno) | Server-side calls to Sleeper/ESPN/Yahoo, Stripe webhooks, payout engine, scheduled jobs |
| Supabase Vault / pgsodium | Encrypted storage of platform tokens (ESPN cookies, Yahoo OAuth) |
| Stripe Connect (Express) | Custodial fund holding, KYC, transfers, payout rails |
| Sleeper public API | Standings, members, rosters (read-only, free, no auth) |
| ESPN unofficial API | Standings, members (cookie auth via WebView capture) |
| Yahoo Fantasy API | Phase 2, OAuth 2.0 |

---

## 2. Codebase Layout

### Current state (`money-league-rnr`, last commit Sept 2025)

```
money-league-rnr/
├── app/                  # Expo Router routes
│   ├── (app)/            # Authenticated routes
│   │   ├── ESPNLeagues.tsx
│   │   ├── ESPNLogin.tsx
│   │   ├── _layout.tsx
│   │   ├── explore.tsx
│   │   ├── index.tsx
│   │   ├── league/
│   │   └── settingsModal.tsx
│   └── (signIn)/         # Public auth routes
│       └── index.tsx
├── components/           # Auth.tsx, ESPNSync.tsx, LeagueCard.tsx, ...
├── context/              # Session context, useStorageState
├── lib/                  # Helpers, icons, theme
├── supabase/
│   ├── functions/        # Currently: hello-world (placeholder)
│   └── migrations/
│       └── 20241009012752_remote_schema.sql
└── utils/                # storage.ts, supabase.ts
```

### Shipped state (as of Session 9 — May 1, 2026)

```
money-league-rnr/
├── app/
│   ├── (app)/                           # Authenticated routes (flat, no (tabs) group yet)
│   │   ├── _layout.tsx                  # Tabs nav: home + explore (placeholder)
│   │   ├── index.tsx                    # Home: list of leagues + sync buttons
│   │   ├── explore.tsx                  # Placeholder; Browse target (🔮 Phase 2)
│   │   ├── settingsModal.tsx            # Lite Profile (sign out, theme)
│   │   ├── ESPNLogin.tsx                # Dead code; will rebuild post-launch
│   │   ├── sleeper-link.tsx             # Sleeper import wizard (deep-link only)
│   │   ├── wallet.tsx                   # Stripe Connect Express (deep-link only)
│   │   └── league/[id]/
│   │       ├── _layout.tsx              # Stack with hidden header
│   │       ├── index.tsx                # League Detail (Standings/Pot/Members tabs)
│   │       ├── buy-in.tsx               # "Set up the pot" (Screen 5.5)
│   │       ├── buy-in-pay.tsx           # Pay buy-in (Screen 5.1)
│   │       ├── receipt.tsx              # Receipt (Screen 5.3)
│   │       └── authorize.tsx            # Standings authorization (Screen 8.2)
│   ├── (signIn)/                        # Public auth + eligibility blocks
│   │   ├── index.tsx                    # Auth (Screen 1.2)
│   │   ├── eligibility.tsx              # Checkpoint 1 (Screen 1.2.5)
│   │   ├── underage.tsx                 # 1.2.6a
│   │   ├── restricted.tsx               # 1.2.6b
│   │   └── suspended.tsx                # 1.2.6c (post-Stripe billing mismatch)
│   └── +not-found.tsx
├── components/
│   ├── Auth.tsx
│   ├── LeagueCard.tsx
│   ├── ScreenTopBar.tsx                 # Shared header (bypasses iOS 26 Liquid Glass)
│   ├── TabBarIcon.tsx
│   ├── TeamInviteCard.tsx
│   ├── ThemeToggle.tsx
│   └── ui/                              # RNR / shadcn primitives
├── lib/
│   ├── database.types.ts                # Generated from Supabase
│   ├── eligibility.ts
│   └── ...
├── supabase/
│   ├── functions/
│   │   ├── auto-finalize-leagues/       # Cron: window expiry + auto-payout
│   │   ├── eligibility-fail-cleanup/    # Deletes auth user on Checkpoint 1 fail
│   │   ├── redeem-sponsorship-code/
│   │   ├── release-reserves/            # Cron: 30-day reserve release
│   │   ├── retry-payout/                # Commish + recipient self-serve
│   │   ├── shared/                      # payout.ts, authorization.ts
│   │   ├── sleeper-import-league/       # (was speced as sleeper-fetch-leagues)
│   │   ├── sponsorship-boost-tick/      # Cron: daily threshold check
│   │   ├── start-authorization-window/
│   │   ├── stripe-account-status/
│   │   ├── stripe-create-buy-in-session/
│   │   ├── stripe-create-connect-account/
│   │   ├── stripe-return/               # In-app browser bridge → potkeeper://
│   │   ├── stripe-webhook/              # checkout.session.completed,
│   │   │                                # transfer.failed/reversed,
│   │   │                                # account.updated, application.deauthorized
│   │   ├── submit-authorization-vote/
│   │   ├── sync-league-standings/       # Cron: standings sync
│   │   └── trigger-payout/              # Commish manual fire
│   └── migrations/                       # ~18 migrations (Pass 1 → Pass 2C complete)
└── docs/
    ├── VISION.md
    ├── APP_FLOW.md
    ├── BRAND.md
    └── TECH_SPEC.md (this file)
```

### Sprint 5 structural targets (still to build)

- **`app/(app)/(tabs)/`** group with `home.tsx`, `leagues.tsx`, `browse.tsx`, `profile.tsx` — currently flat under `(app)/`.
- **`profile.tsx`** with sub-screens: `activity.tsx` (Screen 10.2), `tax.tsx` (Screen 10.3), `connections.tsx`, `notifications.tsx`. Replaces the current `settingsModal.tsx`.
- **`league/[id]/payout.tsx`** — Screen 8.3 dedicated payout-in-progress + 8.4/8.5 winner/non-winner celebrations with Lottie.
- **`get-tax-summary/`** Edge Function — backs the Tax Center screen.
- **`send-notifications/`** Edge Function + Expo Push token registration — backs the entire push notification matrix.
- **`league_activity` view** + **Tab 6.1.4 Activity Feed** — aggregated event stream for League Detail.

### Phase 2+ structural targets (intentionally not in v1)

- **`app/(app)/league/create.tsx`** — Flow 4 create-from-scratch (🔮 Phase 2; Sleeper import covers v1)
- **`app/(app)/league/[id]/join-request.tsx`** + **`join_requests` table** — Phase 2 (`Browse` + paid-join flow)
- **`app/(app)/connect/`** group — currently `sleeper-link.tsx` and `wallet.tsx` live flat; nest later if it gets unwieldy
- **`espn-fetch-leagues/`** Edge Function — ESPN integration deprecated; rebuild post-launch on Vault per §4.2
- **`yahoo.ts`** API client — Phase 2 OAuth
- **`components/leagues/`, `components/pot/`, `components/stripe/`** sub-folders — hoist UI out of the ~2200 LOC `league/[id]/index.tsx` monolith when it gets refactor-painful

### Decision: archive `money-league-dev` and fold `money-league-api`

- `money-league-dev` → archived. Older Tamagui prototype, fully superseded.
- `money-league-api` → planned port to a Supabase Edge Function (originally targeting `espn-fetch-leagues`). The Flask + Python `espn-api` library logic gets translated to Deno + fetch. Eliminates the second deployment and keeps the architecture single-tier. **Status**: ESPN integration is currently dead code in `ESPNLogin.tsx` (home button reads "Coming soon"); the rebuild is post-launch (Phase 2) — Sleeper coverage is sufficient for v1 launch.

---

## 3. Data Model

### Existing tables (from `20241009012752_remote_schema.sql`)

- `profiles` — user profile, ESPN cookies (currently plaintext, MUST move to Vault)
- `leagues` — league metadata
- `owner_leagues` — league membership join table
- `teams` — fantasy teams within a league

### Schema changes for Phase 1

#### 3.1 Update `profiles`

```sql
ALTER TABLE profiles
  -- Sleeper / Stripe identity
  ADD COLUMN sleeper_user_id text,
  ADD COLUMN sleeper_username text,
  ADD COLUMN stripe_customer_id text,                    -- for charges (buyer side)
  ADD COLUMN stripe_connect_account_id text,              -- for payouts (recipient side)
  ADD COLUMN stripe_connect_status text                   -- pending / verified / restricted
    DEFAULT 'pending'
    CHECK (stripe_connect_status IN ('none', 'pending', 'verified', 'restricted')),

  -- Eligibility (state + age) — see §10
  ADD COLUMN date_of_birth date,                          -- self-declared at signup
  ADD COLUMN age_verified_at timestamptz,                 -- when Stripe Connect KYC verified
  ADD COLUMN location_state text,                         -- declared at signup
  ADD COLUMN billing_state text,                          -- from Stripe SetupIntent (canonical)
  ADD COLUMN geo_status text NOT NULL DEFAULT 'pending'
    CHECK (geo_status IN ('pending', 'declared', 'verified', 'suspended')),
  ADD COLUMN ip_country text,
  ADD COLUMN ip_state text,                               -- soft signal
  ADD COLUMN setup_intent_completed_at timestamptz,

  -- Browse near-me
  ADD COLUMN location_city text,
  ADD COLUMN location_lat numeric(9,6),
  ADD COLUMN location_lng numeric(9,6);

-- Move ESPN cookies to encrypted vault. Drop from profiles.
ALTER TABLE profiles DROP COLUMN espn_s2;
ALTER TABLE profiles DROP COLUMN espn_swid;

-- Vault stores: {user_id}_espn_s2 and {user_id}_espn_swid as named secrets
-- Access via vault.read_secret() in edge functions only
```

#### 3.2 Update `leagues`

```sql
ALTER TABLE leagues
  ADD COLUMN visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public_approval', 'public_open')),
  ADD COLUMN source_invite_url text,                      -- Sleeper/ESPN/Yahoo passthrough
  ADD COLUMN source_invite_code text,
  ADD COLUMN waitlist_size integer DEFAULT 0,
  ADD COLUMN max_capacity integer NOT NULL DEFAULT 12,
  ADD COLUMN charity_partner_id bigint REFERENCES charity_partners(id),
  ADD COLUMN charity_percent numeric(5,2) DEFAULT 0 CHECK (charity_percent BETWEEN 0 AND 25),
  ADD COLUMN payout_split jsonb NOT NULL DEFAULT '{"1": 60, "2": 30, "3": 10}'::jsonb,
  ADD COLUMN status text NOT NULL DEFAULT 'pre_season'
    CHECK (status IN ('pre_season', 'in_season', 'awaiting_authorization', 'paying_out', 'complete', 'cancelled')),
  ADD COLUMN bar_partner_id bigint REFERENCES bar_partners(id),  -- nullable
  ADD COLUMN bar_incentive_text text;                            -- "Free first round at draft party"
```

#### 3.3 New: `pot_ledger`

The single source of truth for money in the system. Every dollar has an entry.

```sql
CREATE TABLE pot_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id bigint NOT NULL REFERENCES leagues(id) ON DELETE RESTRICT,
  member_id uuid REFERENCES profiles(id),                 -- NULL for charity, fees
  type text NOT NULL CHECK (type IN (
    'buy_in_paid',              -- member paid into pot
    'sponsorship_credit',       -- PotKeeper-funded boost via sponsorship code (see §3.11)
    'platform_fee',             -- our 2.5% taken at payout
    'stripe_processing_fee',    -- pass-through fee at buy-in
    'payout_winner',            -- transfer to winning member
    'payout_charity',           -- transfer to charity partner
    'reserve_held',             -- 5% held back 30 days
    'reserve_released',         -- reserve released after holdback
    'refund_full',              -- full refund (member removed pre-season)
    'refund_partial',           -- prorated refund (member removed mid-season)
    'chargeback',               -- disputed by buyer
    'adjustment'                -- manual reconciliation, requires audit_reason
  )),
  amount_cents bigint NOT NULL,                           -- always positive; sign implied by type
  currency text NOT NULL DEFAULT 'USD',
  stripe_event_id text UNIQUE,                            -- idempotency key for webhook replay
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  stripe_charge_id text,
  audit_reason text,                                      -- required for type='adjustment'
  created_by uuid REFERENCES profiles(id),                -- who triggered (system user for auto)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pot_ledger_league ON pot_ledger(league_id);
CREATE INDEX idx_pot_ledger_member ON pot_ledger(member_id);
CREATE INDEX idx_pot_ledger_stripe_event ON pot_ledger(stripe_event_id);
CREATE INDEX idx_pot_ledger_created_at ON pot_ledger(created_at DESC);

-- Materialized view for pot balance per league (refreshed on ledger change)
CREATE MATERIALIZED VIEW league_pot_balance AS
SELECT
  league_id,
  COALESCE(SUM(CASE WHEN type IN ('buy_in_paid', 'sponsorship_credit') THEN amount_cents ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN type IN ('payout_winner', 'payout_charity', 'platform_fee', 'stripe_processing_fee', 'refund_full', 'refund_partial', 'chargeback', 'reserve_held') THEN amount_cents ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN type IN ('reserve_released') THEN amount_cents ELSE 0 END), 0)
    AS available_cents,
  COALESCE(SUM(CASE WHEN type = 'reserve_held' THEN amount_cents ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN type = 'reserve_released' THEN amount_cents ELSE 0 END), 0)
    AS reserve_cents,
  COALESCE(SUM(CASE WHEN type = 'sponsorship_credit' THEN amount_cents ELSE 0 END), 0)
    AS sponsorship_credited_cents
FROM pot_ledger
GROUP BY league_id;
```

#### 3.4 New: `join_requests`

Tracks the lifecycle from "interested" to "full member."

```sql
CREATE TABLE join_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id bigint NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES profiles(id),
  requester_source_username text,                         -- "what's your Sleeper username"
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested',                   -- tapped Request to Join
    'approved_pending_source_join', -- commish approved, invite link sent
    'joined_source_pending_payment', -- detected on Sleeper, hasn't paid
    'paid',                        -- full member
    'rejected',                    -- commish denied
    'expired',                     -- 7-day timeout
    'cancelled'                    -- requester withdrew
  )),
  bypass_code text,                                       -- if used a pre-shared code (auto-approve)
  message text,                                           -- requester's intro note
  rejection_reason text,
  approved_by uuid REFERENCES profiles(id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, requester_id)                       -- one request per user per league
);

CREATE INDEX idx_join_requests_league_status ON join_requests(league_id, status);
CREATE INDEX idx_join_requests_requester ON join_requests(requester_id, status);
CREATE INDEX idx_join_requests_expires_at ON join_requests(expires_at) WHERE status = 'requested';
```

#### 3.5 New: `bypass_codes`

For QOL #10 — pre-shared codes that auto-approve specific people.

```sql
CREATE TABLE bypass_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id bigint NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  code text NOT NULL,                                     -- e.g., "BUCKEYES2026"
  max_uses integer DEFAULT 50,
  uses integer DEFAULT 0,
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code)                                           -- globally unique to avoid collisions
);
```

#### 3.6 New: `charity_partners`

```sql
CREATE TABLE charity_partners (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  ein text NOT NULL,                                      -- IRS EIN (501(c)(3) verification)
  description text,
  logo_url text,
  website_url text,
  stripe_connect_account_id text NOT NULL,                -- their payout destination
  active boolean NOT NULL DEFAULT true,
  curated boolean NOT NULL DEFAULT true,                  -- featured in app vs custom search
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### 3.7 New: `bar_partners` (Phase 2 schema, ship table now even if feature gated)

```sql
CREATE TABLE bar_partners (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  address text,
  lat numeric(9,6),
  lng numeric(9,6),
  logo_url text,
  banner_url text,
  fan_club_affiliation text,                              -- "Bills Backers DC"
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'churned')),
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'sponsored_league', 'bar_network')),
  default_incentive text,                                 -- "Free first round at draft party"
  default_incentive_amount_cents bigint,                  -- numeric value of the incentive
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### 3.8 New: `payouts`

Record of every disbursement at end of season.

```sql
CREATE TABLE payouts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id bigint NOT NULL REFERENCES leagues(id) ON DELETE RESTRICT,
  recipient_id uuid REFERENCES profiles(id),              -- NULL for charity
  charity_partner_id bigint REFERENCES charity_partners(id),
  rank integer,                                           -- 1, 2, 3 ... or NULL for charity
  amount_cents bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- queued, awaiting auth window
    'authorized',        -- league authorized, ready to fire
    'processing',        -- transfer.created
    'paid',              -- transfer.paid
    'failed',            -- transfer.failed (e.g., recipient KYC restricted)
    'reserved'           -- 5% holdback portion, scheduled for later
  )),
  stripe_transfer_id text,
  scheduled_for timestamptz,                              -- for reserve releases
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### 3.9 New: `standings_snapshots`

Cache + audit trail of standings pulled from source platform.

```sql
CREATE TABLE standings_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id bigint NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  is_final boolean NOT NULL DEFAULT false,                -- TRUE only when source platform reports complete
  raw_data jsonb NOT NULL,                                -- full API response for audit
  standings jsonb NOT NULL                                -- normalized: [{rank, member_id, team_name, points, record}, ...]
);

CREATE INDEX idx_standings_league_fetched ON standings_snapshots(league_id, fetched_at DESC);
CREATE INDEX idx_standings_league_final ON standings_snapshots(league_id) WHERE is_final = true;
```

#### 3.10 New: `notifications`

Tracks sent push/email notifications, prevents duplicates.

```sql
CREATE TABLE notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES profiles(id),
  type text NOT NULL,                                     -- see APP_FLOW.md notification table
  title text NOT NULL,
  body text NOT NULL,
  data jsonb,                                             -- deep link payload
  push_status text DEFAULT 'pending' CHECK (push_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_status text DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  dedupe_key text,                                        -- to prevent duplicate sends
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
```

#### 3.11 New: `sponsorship_codes` + `leagues` additions

Powers Phase 0.75 GTM tactic (see `VISION.md`). PotKeeper issues codes to NFL fan-group admins, content creators, and bar partners. Codes carry conditional boost amounts that credit a league's pot once participation thresholds are met.

```sql
CREATE TABLE sponsorship_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE,                              -- e.g., 'PKBOOST-FALCONS-2026'
  boost_max_cents bigint NOT NULL,                        -- $500 = 50000
  match_ratio numeric(4,2) NOT NULL DEFAULT 1.00,         -- 1.00 = 1:1 match; 0.00 = flat boost
  partner_name text NOT NULL,                             -- 'Atlanta Falcons FB Fan Club'
  partner_contact_email text NOT NULL,
  partner_admin_name text NOT NULL,
  partner_channel text NOT NULL CHECK (partner_channel IN (
    'fb_group',
    'reddit',
    'discord',
    'creator',
    'bar',
    'other'
  )),
  redeemed_for_league_id bigint REFERENCES leagues(id),
  redeemed_at timestamptz,
  funded_at timestamptz,                                  -- when boost was credited to pot_ledger
  forfeited_at timestamptz,                               -- when conditions failed by deadline
  expires_at timestamptz NOT NULL,                        -- typically NFL kickoff date + 1 day
  conditions jsonb NOT NULL DEFAULT '{
    "min_members_paid_pct": 0.80,
    "min_buy_in_cents": 2500,
    "must_use_auto_payout": true,
    "season": 2026,
    "must_be_one_season_only": true
  }'::jsonb,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN (
    'issued',           -- generated, not yet redeemed
    'redeemed',         -- admin used code on a league, awaiting threshold
    'funded',           -- conditions met, boost credited to pot
    'forfeited',        -- conditions not met by expires_at
    'cancelled'         -- ops revoked before expiry
  )),
  notes text,                                             -- ops free-form notes
  created_by uuid NOT NULL REFERENCES profiles(id),       -- ops user who issued
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sponsorship_codes_status ON sponsorship_codes(status);
CREATE INDEX idx_sponsorship_codes_expires ON sponsorship_codes(expires_at) WHERE status IN ('issued', 'redeemed');
CREATE INDEX idx_sponsorship_codes_league ON sponsorship_codes(redeemed_for_league_id);

ALTER TABLE leagues
  ADD COLUMN sponsorship_code_id bigint REFERENCES sponsorship_codes(id),
  ADD COLUMN sponsorship_boost_max_cents bigint DEFAULT 0,
  ADD COLUMN sponsorship_status text NOT NULL DEFAULT 'none' CHECK (sponsorship_status IN (
    'none',
    'redeemed_pending',     -- code applied, threshold conditions not yet met
    'funded',               -- boost credited to pot
    'forfeited'             -- threshold not met by expires_at; code burned, no boost
  ));
```

**Boost release logic** (Edge Function `sponsorship-boost-tick`, daily during sponsorship season Aug 1 - Sept 8):

```typescript
// Pseudocode
for each league where sponsorship_status = 'redeemed_pending':
  code = sponsorship_codes[league.sponsorship_code_id]
  conditions = code.conditions

  // Check threshold conditions
  members_paid_pct = count(members where has_paid) / count(members)
  uses_auto_payout = league.payout_mode === 'auto'

  if now() > code.expires_at:
    league.sponsorship_status = 'forfeited'
    code.status = 'forfeited'
    code.forfeited_at = now()
    notify_partner(code.partner_contact_email, 'forfeited')
    continue

  if members_paid_pct >= conditions.min_members_paid_pct
     and uses_auto_payout
     and all(member.buy_in >= conditions.min_buy_in_cents):

    // Calculate boost amount based on match_ratio capped at boost_max_cents
    member_pot = sum(pot_ledger where league_id = league.id, type = 'buy_in_paid')
    boost = min(member_pot * code.match_ratio, code.boost_max_cents)

    // Write ledger entry
    insert pot_ledger(
      league_id = league.id,
      member_id = NULL,
      type = 'sponsorship_credit',
      amount_cents = boost,
      stripe_event_id = `sponsorship:${code.code}:${league.id}`,
      created_by = SERVICE_USER,
      audit_reason = `sponsorship_code_${code.id}_redeemed_for_league_${league.id}`
    )

    // Move money from PotKeeper operating account to platform pot
    // (initially via manual ops Stripe transfer; later automated via Stripe BalanceTransaction)
    queue_ops_transfer(amount_cents = boost, ref = code.code)

    league.sponsorship_status = 'funded'
    code.status = 'funded'
    code.funded_at = now()
    notify_league_members(league.id, 'sponsorship_boost_unlocked')
    notify_partner(code.partner_contact_email, 'funded')
```

**Funding source** (v1, manual operations):
1. PotKeeper operating account holds reserved sponsorship budget ($2,500 v1)
2. When boost release fires, ops transfers the boost amount to the platform Stripe balance via dashboard
3. `pot_ledger` entry attaches the funds to the specific league
4. Reconciliation cron treats sponsorship_credit as a deposit (same as buy_in_paid) when validating Stripe balance against ledger

**Funding source** (Phase 2, automated):
- Use Stripe `BalanceTransaction` API to programmatically move funds from a tagged operating reserve to the platform pot. Eliminates manual ops step. Defer until 10+ sponsored leagues per season.

**RLS for `sponsorship_codes`**:

```sql
-- Service role only — clients NEVER read or write this table directly
ALTER TABLE sponsorship_codes ENABLE ROW LEVEL SECURITY;
-- No policies created; default-deny means only service-role bypasses RLS
```

The admin (partner) does not have a PotKeeper account in v1; they receive code-issuance and code-status emails through the operations layer. When a league commissioner enters a code in the Convert/Create flow, the client calls Edge Function `redeem-sponsorship-code` which performs the redemption server-side and returns either `ok` or `invalid_code` / `expired` / `already_redeemed`.

**Code generation conventions**:

- Format: `PKBOOST-{PARTNER_TAG}-{SEASON}` (e.g., `PKBOOST-FALCONS-2026`, `PKBOOST-DCBARMAFIA-2026`)
- Partner tag: 4-12 alphanumeric chars, internal-only identifier (avoids NFL trademark concerns when codes are referenced internally; the code is never displayed publicly with team logos)
- One code per partner per season; reissuance requires a new code with incremented suffix (`PKBOOST-FALCONS-2026-V2`)
- If counsel flags the team-name convention, switch to neutral codes (`PKBOOST-A1`, `PKBOOST-A2`, etc.) without schema changes

**Anti-abuse hardening**:

- `min_buy_in_cents` ≥ $25 prevents $5-buy-in joke leagues from extracting full boost
- `min_members_paid_pct` ≥ 80% prevents admin-stacks-with-friends-and-cancels patterns
- `must_use_auto_payout = true` ensures the league actually uses PotKeeper's payout rails (we paid for the demo; we want it on tape)
- One redemption per code (`UNIQUE` constraint via `redeemed_for_league_id`); admin can't apply same code to multiple leagues

#### 3.12 New: `platform_identities_auto_link` trigger

**Migration**: `20260502000018_auto_link_member_on_identity.sql`.

Closes the gap where a commissioner imports a league before all members have PotKeeper accounts. Without this trigger, `league_members` rows created at import-time stayed `linked_profile_id = NULL` forever — even after the member later signed up and verified their fantasy account, they had to re-run the Sleeper import to be recognized as a league member.

```sql
create or replace function public.auto_link_members_for_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Backfill linked_profile_id on every league_members row whose
  -- (platform, external_user_id) matches the newly-verified identity
  update public.league_members lm
  set linked_profile_id = new.profile_id
  from public.leagues l
  where lm.league_id = l.id
    and l.platform = new.platform
    and lm.external_user_id = new.external_user_id
    and lm.linked_profile_id is null;

  -- Promote commissioner_profile_id when the new identity matches the
  -- platform-marked owner (e.g. Sleeper league owner signs up after import)
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

create trigger platform_identities_auto_link
  after insert on public.platform_identities
  for each row execute function public.auto_link_members_for_identity();
```

**Behavioral implications**:

- Member onboarding becomes order-independent — commissioner-first or member-first both end up with the right links.
- A member who signs up after the league is imported sees the league appear in their Home / Leagues tabs the moment they verify their Sleeper handle, no extra action required.
- Trigger is `AFTER INSERT` only. We rely on the fact that `platform_identities` rows are created once per `(profile_id, platform, external_user_id)` triple and are not mutated; if we ever start updating that table, extend the trigger to `OR UPDATE`.
- Idempotent by construction — repeated inserts of the same identity (which are blocked by uniqueness anyway) would be no-ops because the `linked_profile_id is null` predicate filters out already-linked rows.

#### 3.13 New: `get_sponsorship_view` RPC

**Migration**: `20260502000017_sponsorship_view_rpc.sql`.

`sponsorship_codes` stays service-role-only (§3.11) so partner names, contact emails, and full conditions JSON never reach the client. But the client needs a few public-safe fields to render the Pot tab projected-boost UI: `match_ratio`, `expires_at`, the participation threshold, `funded_at`, and the partner display name.

This `SECURITY DEFINER` RPC exposes exactly that subset, gated to the league commissioner + linked members:

```sql
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
```

The Pot tab `SponsorshipPotBanner` component combines this RPC with the `league_pot_balance` materialized view (`member_paid_cents`, `sponsorship_credited_cents`) to render projected-boost numbers client-side without the server pre-computing them. If the projection logic ever needs to live server-side (e.g. for push notification copy), wrap it in a sibling RPC rather than denormalizing.

---

## 4. External Integrations

### 4.1 Sleeper API (primary, free, public)

**Base URL**: `https://api.sleeper.app/v1`

**Endpoints used:**

| Endpoint | When | Frequency |
|---|---|---|
| `GET /user/{username}` | At Sleeper username connection | Once per connect |
| `GET /user/{user_id}/leagues/nfl/{season}` | Listing user's leagues for "From Sleeper" tab | On Leagues tab open + cached 1hr |
| `GET /league/{league_id}` | League metadata, status | At conversion + 6hr cron |
| `GET /league/{league_id}/users` | Member list | At conversion + on member sync |
| `GET /league/{league_id}/rosters` | Team-to-user mapping | At conversion + on standings sync |
| `GET /league/{league_id}/matchups/{week}` | Weekly scores | Daily during season |
| `GET /league/{league_id}/winners_bracket` | Final playoff results | When league.status = `complete` |
| `GET /league/{league_id}/losers_bracket` | Loser's bracket (consolation) | When league.status = `complete` |

**Rate limits**: stay under 1000 RPM IP-based. We'll batch + cache aggressively.

**Auth**: none required.

**Implementation**: Edge Function `sleeper-import-league` accepts a Sleeper league ID + the importer's profile, calls Sleeper, writes the `leagues` row + `league_members` rows, and returns `{ league_id, member_count, commissioner_external_user_id }` so the client can route forward (see APP_FLOW Screen 3.2). Edge Function `sync-league-standings` runs as cron, iterates active leagues, fetches matchups, writes to `standings_snapshots`.

### 4.2 ESPN API (secondary, cookie auth)

**Base URLs**:
- `https://fan.api.espn.com/apis/v2/fans/{swid}` — list user leagues
- `https://fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{league_id}` — league details

**Auth**: `SWID` and `espn_s2` cookies, captured via WebView (`ESPNLogin.tsx`), stored in **Supabase Vault** (NOT plaintext in `profiles`).

**Cookie expiry**: ~30 days. Re-auth flow needed when API returns 401.

**Implementation**: Port the existing `money-league-api` Flask logic to Deno Edge Function `espn-fetch-leagues`. Translates the Python `espn-api` library calls to direct fetch calls.

### 4.3 Yahoo Fantasy API (Phase 2)

OAuth 2.0 + XML/JSON. Defer to Phase 2.

### 4.4 Stripe Connect

**Account type**: Express-equivalent via controller properties (post-2025 API; `type='express'` is deprecated). We set:

```ts
controller: {
  stripe_dashboard: { type: "express" },   // Stripe-hosted dashboard
  fees: { payer: "application" },           // PotKeeper pays Stripe fees
  losses: { payments: "application" },      // PotKeeper covers negative balances
}
capabilities: { transfers: { requested: true } }
business_type: "individual"
business_profile: {
  mcc: "7997",                              // Membership Clubs - Sports/Recreation
  url: "https://potkeeper.app",
  product_description: "Receives automated disbursements of fantasy sports league winnings via PotKeeper. Recipient does not sell goods or services.",
}
```

We deliberately do **not** request `card_payments` capability — connected accounts don't take charges directly. Buy-ins go to PotKeeper's platform balance; payouts are `transfers.create({ destination: stripe_account_id })` (separate charges + transfers model). The `business_profile` pre-fill is critical: without it, Stripe asks the user "what's your website?" during onboarding which is jarring for an individual receiving league winnings.

**Onboarding return flow:** `account_link.return_url` and `refresh_url` point at the public `stripe-return` Edge Function (`<SUPABASE_URL>/functions/v1/stripe-return`) which serves a branded "Setup complete — close this window" HTML page. Stripe rejects custom URL schemes in `return_url`, so we can't auto-deep-link back into the app. Instead, the wallet screen's `useFocusEffect` refetches status when `expo-web-browser` dismisses, picking up the new state automatically.

**KYC trigger policy (deferred SSN ask):** Stripe Connect requires SSN for any individual receiving payouts (BSA + IRS 1099-K reporting). To avoid Day-1 SSN friction, we **never prompt for Connect onboarding at signup**. Triggers are payout-adjacent only:

- Mid-season: user is in a paying spot → home banner.
- 2 weeks before season end: push notification.
- Post-season: "$X is waiting — set up payouts to claim" card on home/league detail.
- Settings modal shows a "Payouts" status row only if `stripe_account_id IS NOT NULL` (resume / verify).

This matches DraftKings, FanDuel, Underdog, and PrizePicks. Their onboarding flow is identical: pay-in first, KYC only when winnings are owed.

**Charges model**: **Destination charges** with `transfer_data[destination]` for buy-ins, OR **separate charges + transfers** for the payout phase.

For Phase 1, we use the simpler model:

1. **Buy-in**: regular Stripe Checkout session, funds go to platform balance (us). `metadata: { league_id, member_id }`.
2. **Payout**: when payout engine fires, we call `stripe.transfers.create()` for each winner with `destination: profile.stripe_connect_account_id`. Application fee taken via reduced transfer amount (we keep the 2.5%).

**Webhooks (Edge Function `stripe-webhook`):**

| Event | Action |
|---|---|
| `payment_intent.succeeded` | Insert `pot_ledger` `buy_in_paid` row, mark `join_request.status = 'paid'`, send notification |
| `payment_intent.payment_failed` | Notify member, do NOT change status |
| `charge.refunded` | Insert `pot_ledger` `refund_*` row, update league pot, notify |
| `charge.dispute.created` | Insert `pot_ledger` `chargeback` row, freeze any pending payouts to that member, notify ops |
| `account.updated` (Connect) | Update `profile.stripe_connect_status` |
| `transfer.created` | Update `payouts.status = 'processing'`, log `pot_ledger` `payout_winner` (pending) |
| `transfer.paid` | Update `payouts.status = 'paid'`, finalize ledger, notify recipient |
| `transfer.failed` | Update `payouts.status = 'failed'`, alert ops, queue retry |

**Idempotency**: every webhook handler checks `stripe_event_id` against `pot_ledger`. Dupes are no-ops.

**Reserve / holdback**: payout engine pays 95% on Day 1, schedules `reserve_released` ledger entry for Day 30, fires the held 5% transfer on a daily cron.

---

## 5. Pot Ledger / Accounting

The most important section. This is what keeps you out of the "I lost track of $40K" scenario.

### Invariants the ledger enforces

1. **Every cent has an entry.** No money moves without a `pot_ledger` row.
2. **Stripe events are idempotent.** Webhooks may replay; ledger uses `stripe_event_id` as a unique key.
3. **League available balance** is computed by view, not stored. Cannot drift.
4. **Disputes freeze payouts.** A `chargeback` row on a league freezes the `payouts` table for that league until resolved.
5. **Adjustments require a reason.** Manual `type='adjustment'` rows must have `audit_reason` populated and `created_by` set.

### Reconciliation

Daily cron job `reconcile-stripe-balance`:
1. Fetch Stripe platform balance via API
2. Sum `available_cents` across all `league_pot_balance`
3. Sum `payouts.amount_cents WHERE status='reserved'`
4. Sum `pot_ledger.amount_cents WHERE type='reserve_held' AND not yet released`
5. Stripe balance should equal sum of (available + reserves)
6. If mismatch > $1, alert ops with diff

### Migration of existing data

Existing `owner_leagues.has_paid` boolean is fragile — no $$ value, no Stripe linkage. On migration, seed `pot_ledger` from `has_paid = true` rows using the league's `buy_in_amount`, marked as `type='buy_in_paid'` with synthetic `stripe_event_id` like `legacy:{league_id}:{member_id}`. Audit trail preserved.

---

## 6. Permissions Model

### App-level (TypeScript checks before mutations)

See `APP_FLOW.md` Permission Model table. Implemented as helper functions in `lib/permissions.ts`:

```typescript
canConvertLeague(user, sourceLeague): boolean       // requires source-platform commissioner role
canCreateLeague(user): boolean                       // any authenticated user
canEditRules(user, league): boolean                  // commish + (pre-season OR member-vote)
canApproveJoinRequest(user, league): boolean         // commish only
canRemoveMember(user, league): boolean               // commish only
canTriggerPayout(user, league): boolean              // commish only (and only after auth window)
canSeeLeague(user, league): boolean                  // member, or league.visibility != 'private'
```

### Database-level (Postgres RLS)

Strengthen existing policies. Current schema has a critical gap: **no `INSERT` policy on `leagues`** — meaning today no one can create a league through the client. Fix:

```sql
-- New policy: any authenticated user can insert a league IF they're the commissioner
CREATE POLICY "Authenticated users can create leagues" ON leagues FOR INSERT
  WITH CHECK (commissioner_id = auth.uid());

-- New policy: commissioner can update their own leagues' rules
CREATE POLICY "Commissioner can update league" ON leagues FOR UPDATE
  USING (commissioner_id = auth.uid());

-- New policy: commissioner can delete pre-season leagues only
CREATE POLICY "Commissioner can delete pre-season league" ON leagues FOR DELETE
  USING (commissioner_id = auth.uid() AND status = 'pre_season');
```

Add RLS for new tables (`pot_ledger`, `join_requests`, `bypass_codes`, `payouts`, `standings_snapshots`, `notifications`).

`pot_ledger` is **read-only via RLS** for all clients. Writes happen exclusively via Edge Functions using the service role.

### Sensitive fields

- `profiles.stripe_connect_account_id`, `stripe_customer_id`: visible to owner only
- `pot_ledger.stripe_*` fields: never exposed to client; ledger reads strip them
- ESPN cookies: never read by client; only Edge Functions via Vault

---

## 7. Join Flow State Machine

Per `join_request`, the lifecycle:

```
        ┌──────────────┐
        │  requested   │◄────────── Tap "Request to Join"
        └──────┬───────┘            (or use bypass_code → skip to approved)
               │
       ┌───────┴────────┐
       │                │
   approved         rejected
       │                │
       ▼                ▼
┌──────────────┐    ┌──────────────┐
│  approved_   │    │  rejected    │  (terminal)
│  pending_    │    └──────────────┘
│  source_join │
└──────┬───────┘
       │ (sync detects member's roster on Sleeper)
       ▼
┌──────────────┐
│  joined_     │
│  source_     │
│  pending_    │
│  payment     │
└──────┬───────┘
       │ (member completes Stripe Checkout)
       ▼
┌──────────────┐
│    paid      │  (terminal — full member)
└──────────────┘

Timeouts:
- requested → expired (7 days)
- approved_pending_source_join → expired (3 days)
- joined_source_pending_payment → reminder push, no auto-expire (won't kick paid-source members)
```

Implemented as a state machine in `lib/joinRequestState.ts` with explicit transition functions. Edge Function `join-request-tick` runs hourly to expire stale requests and send reminders.

---

## 8. Payout Engine

### Trigger conditions

A league is eligible for payout when:
1. `league.status = 'in_season'` AND
2. Latest `standings_snapshot.is_final = true` AND
3. All paid members have `stripe_connect_account_id` set OR a manual override exists AND
4. No active disputes (`pot_ledger` lacks unsettled `chargeback` entries)

### Sequence

1. Edge Function `detect-season-end` (cron, runs every 6 hours) finds eligible leagues
2. For each, transitions `league.status → 'awaiting_authorization'`, opens 48-72hr auth window
3. Each member taps "Authorize" or "Dispute" in `Screen 8.2`
4. After window closes (or all authorized), Edge Function `trigger-payout`:
   - Reads final standings
   - Computes per-rank amounts from `payout_split` JSONB
   - Computes 95% / 5% split (immediate / reserve)
   - Inserts `payouts` rows for each recipient + charity if applicable
   - Calls `stripe.transfers.create()` for each `payouts.status = 'authorized'` row, idempotently
   - Schedules `reserve_released` payouts for Day 30
5. Webhook handlers update statuses as transfers settle

### Failure modes

| Scenario | Handling |
|---|---|
| Recipient has no Connect account | `payouts.status = 'failed'`, member gets push to onboard, transfer retried daily for 14 days |
| Transfer fails mid-batch | Other transfers proceed; failed one retries hourly; ops alerted after 3 failures |
| Sleeper API down at season end | Use last-known final snapshot if `is_final=true`; manual override via admin tool if needed |
| Member disputes after payout fired | Transfer cannot be reversed; dispute hits platform balance; absorbed by reserve or platform fee margin |

---

## 9. Notifications

Per `APP_FLOW.md` notification table. Implementation:

- **Push**: Expo Push API (free for moderate volume). Token registered on first auth, stored in `profiles.expo_push_token`.
- **Email**: Resend or Supabase native (TBD). Fallback when push fails or user has push disabled.
- **Edge Function `send-notifications`** picks `notifications` rows with `push_status = 'pending'`, fires Expo Push, updates status.
- **Dedupe** via `notifications.dedupe_key` (e.g., `league:{id}:season_ending`) so the cron doesn't double-send.

---

## 9.5 Animation & Motion

Two Lotties for v1 (see `BRAND.md` for visual brief). Implementation:

### Dependencies

```bash
npx expo install lottie-react-native expo-splash-screen
```

### File layout

```
assets/
├── animations/
│   ├── splash.json        # Lottie 1: "Seal the Pot" (2.0-2.4s)
│   └── payout-win.json    # Lottie 2: "The Win" (3.0-4.0s, transparent center)
```

### Splash screen integration

Replace the static splash with a Lottie-rendered launch screen. Native splash from `expo-splash-screen` is held until React mounts, then we hand off to the Lottie.

```tsx
// app/_layout.tsx
import * as SplashScreen from 'expo-splash-screen';
import LottieView from 'lottie-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const animationRef = useRef<LottieView>(null);
  const [animationDone, setAnimationDone] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync();
    animationRef.current?.play();
  }, []);

  if (!animationDone) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center' }}>
        <LottieView
          ref={animationRef}
          source={require('../assets/animations/splash.json')}
          autoPlay
          loop={false}
          onAnimationFinish={() => setAnimationDone(true)}
          style={{ width: 240, height: 240 }}
        />
      </View>
    );
  }

  return <Stack /* ...rest of layout */ />;
}
```

### Payout celebration integration

The `splash.json` Lottie plays self-contained. The `payout-win.json` Lottie has a transparent safe area in the center where we overlay a JS-driven count-up animation showing the actual payout amount.

```tsx
// app/(app)/league/payout-success.tsx
import LottieView from 'lottie-react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

export default function PayoutSuccess({ amountCents }: { amountCents: number }) {
  const animatedAmount = useSharedValue(0);

  useEffect(() => {
    animatedAmount.value = withTiming(amountCents, { duration: 1500 });
  }, [amountCents]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      <LottieView
        source={require('~/assets/animations/payout-win.json')}
        autoPlay
        loop={false}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.amountOverlay}>
        <AnimatedDollarAmount value={animatedAmount} />
        <Text style={styles.subtext}>Sent to your bank — arrives in 1-2 days</Text>
      </View>
    </View>
  );
}
```

### Bundle size budget

- `lottie-react-native` runtime: ~150KB
- `splash.json`: should target <80KB (simple shapes, gradients, ~2s)
- `payout-win.json`: should target <250KB (confetti is the heavy part, ~50-80 particles)
- Total animation bundle: <500KB

If the animator delivers JSON files larger than these targets, ask them to (a) reduce particle counts, (b) flatten unused After Effects layers, (c) run `lottie-optimize` on the export.

### Sourcing the Lottie files

| Path | Cost | Time | Quality | Recommended |
|---|---|---|---|---|
| **Hire on Fiverr / Upwork** with the brief in `BRAND.md` | $200-350 (both) | 7-10 days | High; you own .aep source | ✓ for v1 |
| **LottieFiles marketplace** customize | $0-50 | 1 day | Variable, won't match brand precisely | only for prototyping |
| **AI generators** (Jitter, Rive, Magic Animator) | $20-30/mo | 2-4 hours | Solid for splash; weak for confetti | Phase 2+ |

For v1, hire one Fiverr/Upwork animator and brief them on **both** animations at once. Send the canonical logo PNG + the brief from `BRAND.md`.

---

## 10. Security & Compliance

### Cookie / token storage

- ESPN cookies (`espn_s2`, `SWID`): **Supabase Vault**, named `{user_id}:espn_s2` and `{user_id}:swid`
- Yahoo OAuth tokens (Phase 2): same pattern
- Sleeper: no auth needed
- Stripe API keys: server-side only (Edge Function env vars)

Device-side `SecureStore` is acceptable for ephemeral session tokens but **not** for long-lived platform credentials. Server is canonical.

### KYC and identity

Stripe Connect Express handles full KYC at payout-recipient onboarding. We never store SSNs, IDs, or bank account numbers. Identity verification triggered at Connect Express onboarding.

For **buy-in side**, we use Stripe SetupIntent to verify the cardholder's billing address before charging. No KYC required to *pay in*; full KYC required to *get paid out*.

### Eligibility (state + age)

**v1 policy: a PotKeeper league requires every member to be (a) 18 or older and (b) in a compliant US state.** Mixed-state leagues are not supported in v1. Restricted-state users cannot create accounts. Underage users cannot create accounts.

#### Why the hard-block-at-signup model

We considered allowing restricted-state users to spectate paid leagues, but rejected it for v1:
- The "manual payout to commissioner who reroutes to restricted member" workaround recreates the Matt Miller failure mode we exist to prevent
- Spectator-only experience is a half-broken product that loses the whole league when commissioners decline to exclude friends
- DraftKings model (block at signup) is the App Store-friendliest posture and the cleanest compliance stance
- Estimated ~14% of would-be leagues affected at v1 given bar-heavy local distribution; deferred richer fallback modes to Phase 2 once data justifies the build
- See VISION.md Open Questions for the revisit trigger (>15% abandonment rate)

#### Restricted state list (Phase 1 — confirm with counsel before launch)

| State | Status | Notes |
|---|---|---|
| Washington (WA) | **Hard block** | State AG opinion treats paid fantasy as gambling |
| Idaho (ID) | **Hard block** | State AG opinion explicitly bans paid fantasy |
| Hawaii (HI) | **Hard block** | No legal framework permits paid fantasy |
| Montana (MT) | **Restricted** | Only state-authorized contests (DraftKings has navigated; we won't initially) |
| Louisiana (LA) | **Parish-specific** | Varies by parish; conservative path is full-state block until per-parish list is built |
| Nevada (NV) | **Restricted** | Has its own DFS framework; requires licensure. Block initially. |

States explicitly legalized for paid fantasy (we permit): NY, NJ, PA, IL, IN, IA, CA, MA, GA, FL, TX, OH, MI, AZ (legalized 2021), and the rest of the US not on the restricted list.

Source: [Fantasy Sports & Gaming Association legal map](https://thefsga.org), updated by counsel pre-launch.

Age requirement: **18+** in all permitted states. (Some states' DFS frameworks require 21+, e.g. Massachusetts under DraftKings' license; for v1 we use 18+ as the floor and may tighten per state if counsel advises.)

#### Three-checkpoint enforcement (fail-closed)

```
Checkpoint 1: At signup                  → declaration gate
──────────────────────────────────────
User enters: email, password, state of residence (dropdown), date of birth.
1. If declared state is restricted → hard stop.
   Show: "PotKeeper isn't available in [State] right now due to state law.
          We'll email you if that changes."
   Capture email into restricted_state_waitlist table.
   Do NOT create profiles row.
2. If DOB → age < 18 → hard stop.
   Show: "PotKeeper requires you to be 18 or older."
3. If both pass → create profiles row, geo_status = 'declared',
   age_verified = true (self-declared).
4. IP geolocation captured as soft signal (logged, not blocking).
   If IP-state ≠ declared state, log discrepancy for fraud review.

Checkpoint 2: At first paid action       → Stripe SetupIntent gate
──────────────────────────────────────
User taps "Join League" or "Pay Buy-in" for the first time.
1. Show "Verify your billing info" screen (one-time per account).
2. Collect card + billing address via Stripe SetupIntent (no charge).
3. Stripe returns verified billing details.
4. Read payment_method.billing_details.address.state.
5. If state ∈ restricted list:
   → suspend account (geo_status = 'suspended').
   → ToS clause: declared one state, billing is another = misrepresentation.
   → Show: "Your billing address is in [state] where PotKeeper isn't available."
   → Allow appeal via support if user explains a legitimate mismatch.
6. If state ∈ allowed list:
   → save verified payment method,
   → set geo_status = 'verified',
   → proceed to join/pay.

Checkpoint 3: At every buy-in            → webhook reconciliation
──────────────────────────────────────
On payment_intent.succeeded:
1. Read payment_method.billing_details.address.state.
2. Cross-check against profile.geo_status and restricted list.
3. If drift detected (user changed billing to restricted state mid-life):
   → immediately refund the payment_intent
   → write pot_ledger.refund_full
   → suspend account
   → notify user + ops
4. This catches address drift, profile manipulation, any Layer 1/2 bypass.
```

#### IP vs. billing address policy

**Billing address is canonical. IP is a soft signal.**

| IP location | Declared state (signup) | Billing state (Checkpoint 2) | Decision |
|---|---|---|---|
| Restricted | Allowed | Allowed | ✅ Allow. Log IP mismatch as fraud signal. |
| Allowed | Allowed | Restricted | ❌ Suspend at Checkpoint 2. ToS allows. |
| Restricted | Restricted | — | ❌ Hard block at Checkpoint 1. |
| Persistent restricted IP across many sessions | Allowed | Allowed | ✅ Allow but ping: *"Looks like you've been in [State] a lot — update your address?"* |

Why billing is canonical: Stripe compliance treats it as authoritative; IP unreliable (VPNs, hotels, mobile carriers); legal frame is "residence" not "current location."

#### Convert-existing-league flow (the warning)

When a commissioner converts a Sleeper/ESPN/Yahoo league to PotKeeper, we **cannot** pre-check member states because we don't have their billing addresses yet. The flow:

```
1. Commissioner taps "Add PotKeeper" on their league.
2. We pull members from Sleeper (usernames + display names; no addresses).
3. WARNING SCREEN:
   "Heads up: PotKeeper requires every member to be 18+ and in
    an eligible state. Members in WA, ID, HI, MT, NV, or parts
    of LA can't join, and members under 18 can't join.
    Continue anyway?"
   [ Continue ] [ Not now ]
4. Commissioner continues → league created → invites sent.
5. Members sign up over time.
   - Eligible members: pass Checkpoints 1 and 2 → join paid → good.
   - Restricted/underage members: blocked at Checkpoint 1.
     → Quiet notification to commissioner:
       "Steve M. couldn't join — PotKeeper isn't available in
        their state. The league will continue with the other members."
       (Reveals state restriction generally, NOT the specific state.)
6. League proceeds with eligible members. Commissioner sees a
   "Members" panel:
     ✅ 11 paid up
     ⏳ 1 not joined (state restricted) — [ Replace ] [ Continue without ]
```

If the **source-platform commissioner is in a restricted state**, the league cannot be converted at all. The commissioner sees:

> *"Only the league's commissioner can move it to PotKeeper, and PotKeeper isn't available in your state. If another league member is in an eligible state, they can take over commissioner role on Sleeper and convert the league themselves."*

#### Edge cases handled

| Scenario | Behavior |
|---|---|
| Member moves states mid-season (NY → WA Week 8) | Buy-in was legal at initiation; grandfathered for the current season. At payout time: Stripe Connect KYC may flag WA address; fall back to manual ACH/check disbursement. They cannot start NEW leagues from WA. |
| Snowbird / business traveler at buy-in | Billing address is canonical. NY-billed card from Seattle hotel WiFi → permitted. |
| User declares allowed state at signup, billing turns up restricted | Suspend at Checkpoint 2. ToS clause covers misrepresentation. |
| User updates billing to restricted state mid-life | Caught at Checkpoint 3. Refund + suspend. |
| Commissioner moves to restricted state | Existing leagues run out the season. Cannot create new leagues. |
| Source-platform commissioner is in restricted state at conversion | Hard block. Suggest passing Sleeper commissioner role to an eligible member. |
| Underage user attempts signup with falsified DOB | Self-declared at signup; caught at Stripe Connect KYC at payout time. ToS forfeits winnings + terminates account. |
| VPN abuse at signup | Declared state passes Checkpoint 1; billing canonical at Checkpoint 2 catches it. |

#### Database schema

```sql
ALTER TABLE profiles
  ADD COLUMN date_of_birth date,                            -- self-declared at signup
  ADD COLUMN age_verified_at timestamptz,                   -- when Stripe Connect KYC verified
  ADD COLUMN location_state text,                           -- 2-letter US state code, declared
  ADD COLUMN billing_state text,                            -- from Stripe SetupIntent (canonical)
  ADD COLUMN geo_status text NOT NULL DEFAULT 'pending'
    CHECK (geo_status IN ('pending', 'declared', 'verified', 'suspended')),
  ADD COLUMN ip_country text,
  ADD COLUMN ip_state text,                                 -- soft signal only
  ADD COLUMN setup_intent_completed_at timestamptz;

-- New table: capture restricted-state users for future "we're now available" outreach
CREATE TABLE restricted_state_waitlist (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  state text NOT NULL,
  ip_state text,
  notified_at timestamptz,                                  -- set when state legalizes
  source text,                                              -- 'signup', 'invite_blocked', 'browse_blocked'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, state)
);
CREATE INDEX idx_waitlist_state ON restricted_state_waitlist(state);
```

Geo states explained:
- `pending`: account just created, no checkpoints passed
- `declared`: passed Checkpoint 1 (state declaration + age 18+)
- `verified`: passed Checkpoint 2 (Stripe SetupIntent confirmed billing in allowed state)
- `suspended`: failed any checkpoint or webhook reconciliation; locked from money actions

#### Marketing site eligibility check (App Store disclosure)

- App Store description footer: *"Available in compliant US states. Not available in WA, ID, HI, MT, NV, parts of LA. Must be 18+."*
- potkeeper.app: IP-based geolocation on landing → soft banner *"✅ Available in [State]"* or *"Coming soon to [State] — get notified."* (Soft signal; address-based check is canonical at signup.)
- Restricted-state visitor capture: hits a `/notify` form, writes to `restricted_state_waitlist`, automated email when state legalizes.

#### Commissioner notification copy (Edge Case A1)

When a member fails Checkpoint 1 due to restricted state:

> *"Heads up: 1 member couldn't join — PotKeeper isn't available in their state. Your league will continue with the rest of the group. You can [Replace this member] or [Continue without them]."*

We tell the commissioner the *fact* of state restriction (so they can act), not the *which* state (preserves member privacy at the level that matters).

#### ToS clauses required

- User represents declared state and DOB are accurate and primary
- Misrepresentation = immediate account termination + winnings forfeit
- PotKeeper reserves right to refuse buy-ins or payouts in any jurisdiction
- Mandatory arbitration clause (Apple 5.3 expects this)
- Disputes resolved in our HQ state's jurisdiction
- 18+ required; 21+ in any state where state law mandates it

#### Known limitation (v1)

**Mixed-state leagues are not supported in v1.** A league cannot include both compliant-state and restricted-state members. If the commissioner has a friend in WA, that friend cannot participate in the PotKeeper version of the league.

**Why we accept this**:
- ~14% of leagues estimated affected at v1 given bar-heavy distribution; lower than the national rate
- Cleaner architecture (no spectator mode, no mixed-mode leagues, no manual disbursement edge cases)
- LeagueSafe has the same limitation; not a competitive disadvantage
- Better to ship-and-measure than to pre-engineer for unknown rates

**Revisit trigger**: if >15% of created leagues abandon at the eligibility warning step (measured at 100 leagues, then 500), prioritize Phase 2 fallback modes:
1. Free-to-play guest with prize cascade (legally clean but weakens "auto-paid always" claim)
2. League-wide manual mode (LeagueSafe-style for mixed leagues; proven legal but adds complexity)
3. Out-of-band private accommodation (commissioner handles restricted members entirely outside PotKeeper)

### Tax reporting (1099-K)

#### Who issues the 1099-K

**Stripe Connect Express is the form filer.** Because every payout member onboards as a Stripe Connect Express account and receives funds directly from Stripe (with PotKeeper as the platform), Stripe is the legal payor of record. Stripe handles 1099-K issuance end-to-end:

- Tracks gross payments per recipient per calendar year
- Issues 1099-K via Stripe Express dashboard (downloadable PDF + e-filed with IRS)
- Mails paper copies to recipients who opt in
- Files corrections if the recipient flags an error
- Provides Express dashboard for recipients to update tax info

**PotKeeper has zero engineering burden for tax form generation.** No 1099-K rendering, no IRS e-filing, no W-9 collection (Stripe Connect onboarding collects SSN/EIN as part of KYC).

#### IRS thresholds (2026 tax year)

| Threshold | Tax year | Notes |
|---|---|---|
| $5,000 in gross payments | 2024 | Phased rollout per IRS Notice 2023-74 |
| $2,500 in gross payments | 2025 | Phased rollout |
| **$600 in gross payments** | **2026 forward** | Settled threshold under American Rescue Plan |

**No transaction count threshold.** A user receiving $601 across one or fifty payouts gets a 1099-K. State thresholds may be lower (CA, MA, VA, NJ have $600 floors regardless of federal phase-in); Stripe handles state-specific issuance.

#### What we tell users (UX strategy)

Transparency at every payout stage. Users see their YTD winnings reflected in:
- **Receipt screen** after each payout: "$X paid out today. Your year-to-date PotKeeper winnings: $Y."
- **Profile → Tax Center**: persistent surface showing YTD winnings, 1099-K threshold progress, and explainer FAQ
- **Email at $500 cumulative**: "Heads up: you're approaching the 1099-K threshold. Here's what that means."
- **App push at first payout that crosses $600**: "You've hit the 1099-K threshold for this year. Stripe will issue your form by January 31."

The strategy is **make the form predictable, not surprising**. Users who understand 1099-Ks before they receive one rate the experience higher in early-access tax-season surveys (per Stripe's own platform research).

#### What we do NOT do

- Do NOT advise users on whether to report winnings (we are not a CPA)
- Do NOT issue our own 1099-K, 1099-MISC, or W-2G (Stripe is the filer; double issuance creates IRS reconciliation problems)
- Do NOT offer a "make payouts smaller to avoid 1099-K" mode (that's structuring; potentially fraud)
- Do NOT collect or store SSNs (Stripe Connect Express does this server-side under their compliance; we never see it)

#### Withholding (state-specific edge cases)

Some states require backup withholding on gambling-coded payouts (e.g., NJ at 3%, NY at 8.82% on payouts over certain thresholds). Because PotKeeper structures contests as **skill-based fantasy** (UIGEA carve-out), gambling withholding does not apply. Stripe Connect Express handles any state-specific 1099-K issuance variations automatically. We do not implement custom withholding logic in v1.

If counsel later determines a state requires withholding for our model, the engineering work is: (a) read state from `payouts.recipient_id → profile.billing_state`, (b) reduce transfer amount by withholding rate, (c) write `pot_ledger` row with `type='adjustment'` and `audit_reason='state_withholding'`, (d) remit withholding via Stripe to the state. Defer until material.

#### YTD winnings calculation (for the Tax Center UX)

```sql
-- Sum of completed payouts to a user in the current calendar year
SELECT
  recipient_id,
  COALESCE(SUM(amount_cents), 0) AS ytd_winnings_cents,
  COUNT(*) AS payout_count
FROM payouts
WHERE recipient_id = $user_id
  AND status = 'paid'
  AND created_at >= date_trunc('year', now())
GROUP BY recipient_id;
```

Surfaced via Edge Function `get-tax-summary` which also returns:
- Whether the user is above the federal threshold ($600)
- Whether their state has a lower threshold
- Stripe Express dashboard deep link (where the actual 1099-K lives once issued)

#### Database schema (no new tables required)

YTD winnings derive from `payouts` and `pot_ledger`. No tax-specific tables needed. The Stripe Connect Express dashboard is the canonical 1099-K destination; we just deep-link to it from `Profile → Tax Center`.

#### App Store / disclosure copy

**Profile → Tax Center**:
> *"PotKeeper payouts are processed by Stripe. If your winnings cross $600 in a calendar year, Stripe will issue you a 1099-K by January 31 of the following year. You can find your 1099-K in your Stripe Express dashboard."*

**Help Center → Taxes FAQ** (lives at `potkeeper.app/tax`):
- Q: Will I receive a 1099-K?
- Q: Do I have to report winnings if I didn't get a 1099-K?
- Q: My state has a different threshold. What happens?
- Q: I see fees on my payout receipt. Are those deductible?
- Q: I won and lost across leagues. Do I report net or gross?
- Q: Where do I get my 1099-K?

Each FAQ links to the relevant IRS publication and ends with: *"This isn't tax advice. Talk to a CPA for your specific situation."*

#### Open question (revisit triggers)

- If users report being surprised by 1099-Ks at >5% rate, expand in-app surfacing earlier (e.g., countdown banner from $400 cumulative)
- If state-specific issuance discrepancies emerge, add per-state copy in Tax Center
- If Stripe changes their 1099-K UX in Express dashboard, update our deep links accordingly

### Encryption

- Data at rest: Supabase default (AES-256)
- ESPN cookies: pgsodium-encrypted via Vault
- Pot ledger: not encrypted but row-level secured (RLS service-role only writes)
- TLS everywhere (default Supabase + Stripe)

### Audit trail

`pot_ledger` is append-only — no UPDATE policy in RLS. Adjustments require `audit_reason`. `payouts` mutations recorded in `notifications` for cross-reference. Every Stripe webhook event recorded with `stripe_event_id`.

---

## 11. Observability

### Logs
- Edge Function logs to Supabase Logs
- Client-side errors → Sentry (free tier sufficient v1)

### Metrics
- Pot total across all leagues (gauge)
- Buy-ins per day (counter)
- Payouts per day (counter, by status)
- Webhook latency (histogram)
- Stripe API errors (counter, alert on spike)
- Failed transfers (alert immediately)

### Alerts (PagerDuty-lite via email/SMS)
- Reconciliation drift > $1
- 3+ consecutive transfer failures on a league
- Webhook handler error rate > 5%
- Sleeper / ESPN API health check fail (degrade gracefully)

---

## 12. Build Order (Phase 1 — 10 weeks)

### Sprint 0 (this week, in parallel with planning)
- **Apple Developer Program enrollment** ($99/yr) — blocks TestFlight
- **Stripe Connect platform application** — submit Day 1 of build, ~2-4 weeks to approve, blocks all money flows
- **Domain purchase** — `potkeeper.app` ($14.99) + Twitter/X/Instagram handles
- **Privacy policy + ToS draft** — engage a fantasy-sports lawyer or use a templated service to start; final review pre-submission

### Sprint 1 (Week 1-2): Foundation
- Migrate ESPN cookies to Vault
- Add RLS INSERT/UPDATE/DELETE policies on `leagues`
- Fix `add_member_to_league` RPC SQL bug
- Schema migration: `pot_ledger`, `payouts`, `join_requests`, `standings_snapshots`, `bypass_codes`, `charity_partners`, `bar_partners`, `restricted_state_waitlist`
- Profile schema additions: DOB, location_state, billing_state, geo_status, etc.
- ~~Tab bar restructure: Home / Leagues / Browse / Profile~~ — **deferred to Sprint 5 (May 2026 expanded scope)**. Pass 1 → Pass 2C all shipped without the tab restructure; pulled forward into Sprint 5 because every other Sprint-5 flow assumes it.

### Sprint 2 (Week 3-4): Sleeper Integration + Eligibility
- Edge Function `sleeper-import-league`
- "From Sleeper" sub-tab + Unconverted League Card
- Convert Existing League flow (commissioner path) including the eligibility warning screen
- Suggest PotKeeper flow (member path)
- Sleeper standings sync cron
- **Checkpoint 1 (signup)**: state + age declaration gate, restricted_state_waitlist capture
- Marketing site IP-based eligibility soft check

### Sprint 3 (Week 5-6): Money In

**Pass 1 — happy-path money flow (Session 5, shipped)**:
- ~~`pot_ledger` table + `league_pot_balance` materialized view + `league_members.payment_status` column~~ ✅ migration `20260501000009_pot_ledger_and_payment_status.sql`
- ~~Edge Function `stripe-create-buy-in-session` — creates a Stripe Checkout Session for a single buy-in, returns checkout URL with metadata for webhook hand-off~~ ✅
- ~~Edge Function `stripe-webhook` (no-JWT) — verifies Stripe signature, handles `checkout.session.completed`, writes `buy_in_paid` ledger row, flips `league_members.payment_status='paid'`, refreshes the MV~~ ✅
- ~~Vercel-hosted `/buy-in-return` bridge → `potkeeper://buy-in-return` (mirrors the Connect onboarding bridge)~~ ✅
- ~~League detail screen "Pay buy-in" CTA (only when buyin_configured + caller is linked + payment_status='unpaid')~~ ✅
- ~~Screen 5.1 (`buy-in-pay.tsx`) — confirm + consent + open Stripe Checkout via `openAuthSessionAsync`~~ ✅
- ~~Screen 5.3 (`receipt.tsx`) — polls `league_members.payment_status` for up to 30s after browser dismiss; surfaces "try again" on timeout~~ ✅
- ~~Checkpoint 2/3 happy path: webhook reads `payment_method.billing_details.address.state`, sets `geo_status='verified'` if allowed, sets `geo_status='suspended'` if restricted (refund deferred)~~ ✅

**Pass 1 simplifications (deferred to Pass 2)**:
- **Dedicated SetupIntent screen (Screen 5.0)** — Pass 1 collects billing inline in Stripe Checkout. Equivalent compliance, fewer screens. Spec calls for the standalone screen for second-buy-in flow polish; we'll add it when we wire saved payment methods.
- **Refund logic for restricted-state mismatches** — Pass 1 suspends the profile but doesn't auto-refund. Money sits in PotKeeper's Stripe balance; ops issues manual refunds from the dashboard while we ship the auto-refund path.
- **Stripe processing-fee accounting** — Pass 1 charges `buy_in_cents` flat; PotKeeper absorbs Stripe's 2.9%+$0.30. No `stripe_processing_fee` ledger rows yet. Pass 2 wires this per `leagues.fee_payer`.
- **`join_requests` table + paid-join flow** — Pass 1 only supports buy-ins from already-linked members (Sleeper importer auto-links anyone). Pass 2 adds the request-to-join lifecycle for non-members.
- **Reconciliation cron** — Pass 1 is webhook-driven only. Pass 2 adds an hourly cron that checks Stripe → DB drift.
- **Refund webhook events** (`charge.refunded`, `charge.dispute.created`) — Pass 2.

**One-time Stripe dashboard setup (sandbox)**:
1. Register webhook endpoint:
   - URL: `https://peqencqtqgplcftfgjxd.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`
   - Copy the signing secret (`whsec_...`)
2. Set Supabase secret: `STRIPE_WEBHOOK_SECRET=whsec_...`

### Sprint 4 (Week 7-8): Money Out

**Pass 1 — Standings authorization (Session 6, shipped)**:
- ~~`standings_authorizations` table (one row per snapshot×member vote, status `pending`/`approved`/`disputed` with `dispute_reason` text) + `leagues.authorization_window_started_at`/`closes_at`/`authorization_status` columns~~ ✅ migration `20260501000011_standings_authorization.sql`
- ~~Edge Function `start-authorization-window` — commissioner-only; preconditions (final snapshot exists, status=`not_started`, ≥1 linked member); stamps the 72hr window on `leagues` and seeds `pending` rows for every linked member~~ ✅
- ~~Edge Function `submit-authorization-vote` — server-side state-machine guard (window is open + not expired), records approval or dispute, transitions league to `closed_authorized` (all approve) or `closed_disputed` (first dispute freezes the league)~~ ✅
- ~~Screen 8.2 `app/(app)/league/[id]/authorize.tsx` — countdown banner (per-second tick), projected payouts card driven by `payout_split` × pot total, locked final standings list, "Looks right" / "Something's wrong" actions with inline dispute reason input, live "X of Y authorized" progress strip~~ ✅
- ~~League detail wiring — cross-tab `AuthorizationBanner` whenever status ≠ `not_started`; commissioner-only `OpenAuthorizationCTA` on the Pot tab when latest snapshot has `is_final=true` and the window hasn't been opened~~ ✅

**Pass 1 simplifications (deferred to Pass 2)**:
- **Auto-firing payouts on close** — Pass 1 records the consensus but doesn't pay anyone. Closed-authorized leagues sit waiting on the payout engine.
- **Dispute resolution flow** — Pass 1 freezes the league on first dispute. Pass 2 adds a commissioner UI to view dispute reasons, communicate with the disputer, optionally re-sync standings, and reopen / re-authorize.
- **Cron-driven window expiry** — Pass 1 only closes via votes. Pass 2 adds a cron that watches `idx_leagues_auth_open` and auto-closes (or auto-extends) on `closes_at`.
- **Push notifications** — window-opened, your-turn-to-vote, dispute-raised, window-closing-soon. All deferred to Sprint 5.
- **Window extensions / late votes / re-opens after dispute** — all Pass 2.
- **Email summaries to unlinked members** — flagging Sleeper-only members that they need to authorize on PotKeeper. Pass 2.

**Pass 2A — payout engine (Session 7, shipped)**:
- ~~`payouts` table (one row per rank/charity slot per snapshot, status `pending`/`waiting_on_connect`/`processing`/`paid`/`failed`/`reversed`, idempotent via UNIQUE(league_id, snapshot_id, rank))~~ ✅ migration `20260501000012_payouts.sql`
- ~~Shared payout engine `supabase/functions/shared/payout.ts` — single source of truth for fee math, allocation, recipient resolution, Stripe `transfers.create()` calls, ledger writes. Idempotent at (league, snapshot) via UNIQUE. Throws structured `PayoutError` codes that callers map to UX (manual = HTTP status; auto-fire = swallow `already_triggered`).~~ ✅
- ~~Edge Function `trigger-payout` — commissioner-only, JWT-gated retry/safety valve. Delegates to the shared engine.~~ ✅
- ~~**Auto-fire from `submit-authorization-vote`** — the moment the last approval tips the league to `closed_authorized`, the server invokes `runPayoutForLeague()` inline (system-initiated, `initiated_by=NULL`). This is the "no commissioner needed" trust pitch. Vote response carries `payouts_summary` so the UI can show "Standings authorized · X paid, Y waiting on Connect onboarding" in a single toast. Auto-fire failures are non-fatal — the vote still lands and the commissioner CTA serves as fallback retry.~~ ✅
- ~~Stripe webhook handlers `transfer.failed` (flip `payouts.status='failed'` + capture failure_reason) and `transfer.reversed` (status=`reversed`, append `chargeback` ledger row to keep pot balance honest)~~ ✅
- ~~Pot tab UI — `PayoutTriggerCTA` (commissioner-only retry, only renders when auto-fire produced zero payout rows), `PayoutStatusList` (replaces breakdown card once payouts exist; shows live status pill per rank), `MyPayoutOnboardingCTA` (recipient-side prompt when their payout is `waiting_on_connect`, deep-links to `/wallet`)~~ ✅

**Pass 2A simplifications (deferred to Pass 2B / Pass 2C)**:
- **Reserve / 5% holdback** — Pass 2A pays out 100% of distributable on trigger. Reserve mechanism + Day-30 release cron is Pass 2C.
- **Charity slot wiring** — **deferred** (see Pass 2C — charity out of v1 surface). Schema may still expose `recipient_kind='charity'` / `payout_charity` for future use; engine allocates to winner ranks only until a future slice.
- **`account.updated` webhook** — for real-time Connect onboarding sync. Today the wallet refresh-on-focus is the catch-up. Pass 2C.
- **Stripe processing-fee accounting** — same Pass 1→Pass 2 deferral as buy-ins; the platform absorbs Stripe's 2.9%+$0.30 on each transfer.

**Pass 2B — autonomous close-out (Session 8, shipped)**:

The product promise is "PotKeeper auto-disburses." Pass 2A still required a commissioner CTA on edge cases (commissioner never opens window; payouts stuck waiting on Connect onboarding). Pass 2B closes those holes so a fully-absent commissioner produces a fully-paid league.

- ~~Shared `supabase/functions/shared/authorization.ts` — extracted `openAuthorizationWindow()` so both `start-authorization-window` (manual) and `sync-league-standings` (auto) call the same engine. Idempotent: `already_started` is a no-op.~~ ✅
- ~~`sync-league-standings` auto-opens the window the moment a snapshot lands with `is_final=true`. Response body carries `auto_authorization` summary so the client can toast "Season is final · authorization window opened for N members."~~ ✅
- ~~`leagues.authorization_auto_finalized_at timestamptz` audit column~~ ✅ migration `20260501000013_authorization_auto_finalized.sql`
- ~~Edge Function `auto-finalize-leagues` — `X-Cron-Secret`-gated cron that (a) closes any expired open window by flipping pendings to `approved` (silence = consent), stamping `authorization_auto_finalized_at`, and invoking `runPayoutForLeague()` system-fired; (b) safety-net opens windows for any league stuck `not_started` despite already having a final snapshot cached (covers the "no one ever syncs" race).~~ ✅
- ~~`pg_cron` schedule `potkeeper-auto-finalize` (`0 */6 * * *`) hits the function via `pg_net` with the X-Cron-Secret pulled from Supabase Vault entry `potkeeper_cron_secret`.~~ ✅ migration `20260501000014_schedule_auto_finalize_cron.sql`
- ~~Shared `retryPayoutsForLeague()` helper in `shared/payout.ts` — re-resolves Connect status per recipient, retries with the same `potkeeper-payout-${id}` Stripe idempotency key (Stripe returns existing transfer or creates one safely), and writes the missing `pot_ledger` row on success.~~ ✅
- ~~Edge Function `retry-payout` — JWT-gated. Two auth modes: commissioner can retry every pending row in the league; recipients can self-serve their own row by passing `payout_id`. Returns structured `{ retried, skipped }`.~~ ✅
- ~~Pot tab UI: commissioner-side "Retry" pill on `PayoutStatusList` (only renders when ≥1 row is `waiting_on_connect`/`failed`); recipient-side "Release now" secondary action on `MyPayoutOnboardingCTA` so the winner self-serves immediately after onboarding without bugging the commissioner.~~ ✅

**Pass 2C (Session 9 — sponsorship, reserve, bars, Connect webhook, shipped)**:
- ~~`account.updated` (and optionally `account.application.deauthorized`) on `stripe-webhook` — real-time `profiles` Connect fields; wallet no longer depends only on refresh-on-focus.~~ ✅ both events handled in `supabase/functions/stripe-webhook/index.ts`; resolves the matching §13.5 tech-debt item.
- ~~**Reserve / holdback (day 1)** — payout engine pays **95%** on authorize-close; **5%** per payout slot held **30 days** (`payouts.status='reserved'`, `scheduled_for`). Daily `release-reserves` Edge Function + cron. Ledger: `reserve_held` / `reserve_released`. **Auto-pause reserve release** while the league has an unresolved buy-in chargeback path (D4.a); resume when cleared or ops resolves.~~ ✅ migration `20260502000015_payout_reserves_and_disputes.sql` (adds `payouts.payout_slice`, `scheduled_for`, `leagues.buyin_dispute_open_count`); `release-reserves` Edge Function + `potkeeper-release-reserves` cron (every 6h). Auto-pause keys off `buyin_dispute_open_count > 0`.
- ~~**PotKeeper sponsorship codes** — `sponsorship_codes` table; `redeem-sponsorship-code` Edge Function; collapsed **"Have a sponsorship code?"** on Create/Convert when commissioner adds a league; Pot tab banner for `redeemed_pending` vs `funded` (threshold copy per code `conditions` JSON).~~ ✅ migration `20260502000016_sponsorship_codes_and_bar_partners.sql`. Affordance now also surfaces on (a) the `PotUnconfiguredCard` (commissioner pre-buy-in setup), (b) the Pot tab when `sponsorship_status = 'none'` on a configured league, and (c) the Sleeper-import success step (commissioner-only). All three route to the buy-in `SponsorshipSetupSection` so redemption stays single-source. Pot tab banner extended into a **live projected-boost UI** for `redeemed_pending` (boost = `min(member_pot_paid * match_ratio, boost_max_cents)` with a paid-progress bar against `conditions.min_members_paid_pct` and an expires-in countdown). Backed by `get_sponsorship_view` RPC (§3.13) so clients read the public-safe sponsorship fields without exposure to the rest of `sponsorship_codes`.
- ~~**`sponsorship-boost-tick`** — daily cron year-round; no-ops when no leagues in `redeemed_pending`. Funds league when thresholds + expiry rules in §3.11 pass; otherwise forfeits at `expires_at`.~~ ✅ Edge Function + `potkeeper-sponsorship-tick` cron. **Paid-pct denominator reconciled with the buy-in UI** (`linked_profile_id IS NOT NULL OR is_owner = true`) so the threshold is reachable for real Sleeper-imported leagues.
- ~~**Bar partners (v1)** — `bar_partners` + `leagues.bar_partner_id` / `bar_incentive_text` (or equivalent). **Banner on League Detail when linked** — partner name + deal copy only. **No `pot_ledger` rows for bar perks** in v1; bars negotiate perks directly with the league; PotKeeper does not move platform money for those deals. Seed DB after partner conversations.~~ ✅ table + RLS (read-anyone), banner on League Detail. Seeding deferred to admin-dashboard slice (§13.4).
- **Charity** — **deferred / out of v1 product surface** (optional giveback in APP_FLOW prototype not shipping). Existing schema enums (`payout_charity`, etc.) may remain unused until a future slice.

**Pass 2C add-ons not in the original spec scope (shipped this session)**:
- ~~**`get_sponsorship_view` RPC** (§3.13) — `SECURITY DEFINER` function exposing public-safe sponsorship fields (match_ratio, expires_at, conditions.min_members_paid_pct, funded_at, partner_name) to commissioner + linked members. Lets the projected-boost UI render without granting any client read access to `sponsorship_codes`.~~ ✅ migration `20260502000017_sponsorship_view_rpc.sql`.
- ~~**`platform_identities_auto_link` trigger** (§3.12) — `AFTER INSERT` on `platform_identities` auto-links any `league_members` row whose `(platform, external_user_id)` matches the new identity, and promotes `commissioner_profile_id` when the new identity matches a Sleeper-marked owner. Closes the "commissioner imports league → member signs up later → silently never joins" gap.~~ ✅ migration `20260502000018_auto_link_member_on_identity.sql`.
- ~~**Sleeper-link state-aware leagues list** — already-imported leagues render subdued with "Already added" pill + "View league" CTA, and a "Notify {commish}" Share button when the caller isn't the commissioner. Cross-checks Sleeper league IDs against PotKeeper's `leagues` table on lookup. See `APP_FLOW.md` Screen 3.1.c.~~ ✅
- ~~**League invite affordances** — League header replaces the plain Members count with a colored fraction (joined/total) + dot tone (green/amber/red) + "on PotKeeper" sub-label; commissioner card gains an "Invite" Share button when the commissioner isn't on PotKeeper; Members tab shows joined/total in its header and renders a per-row "Invite" Share pill for each unlinked non-commish member. All routes go through a shared `shareLeagueInvite` helper that drops a deep link via the native Share sheet. See `APP_FLOW.md` Screen 6.1 / Tab 6.1.3.~~ ✅
- ~~**Shared `components/ScreenTopBar.tsx`** — back-chevron + title + theme-toggle pattern extracted to bypass iOS 26 Liquid Glass capsule headers. Wired through league index, authorize, buy-in, buy-in-pay; receipt left as-is since it intentionally suppresses back navigation.~~ ✅

#### Pass 2C — Funding model (sponsorship vs bar deals)

| Flow | Postgres / ledger | Stripe cash |
|------|------------------|-------------|
| **Sponsorship boost** (`sponsorship_credit`) | **Canonical.** When `sponsorship-boost-tick` credits a league, insert `pot_ledger` (`type='sponsorship_credit'`, idempotent `stripe_event_id` / audit key per §3.11), flip `leagues.sponsorship_status` / code row to `funded`. Materialized view refresh keeps pot totals honest. | **Manual in v1.** Ops moves the matching USD from PotKeeper’s operating reserve into platform balance (Stripe Dashboard or internal runbook) so **ledger sum ↔ Stripe balance** stays reconcilable. **Automate later** (e.g. Balance Transaction–style plumbing per §3.11 Phase 2) when sponsored league volume warrants it. |
| **Bar incentive** | **No ledger.** Display-only: name, logo URL, `bar_incentive_text` (“$20 bar credit at draft,” etc.). | **None** — no platform payout or transfer for bar promises in v1. |

### Sprint 5 — Expanded scope (May 1 → July 25 submission, ~12 weeks)

The original 2-week Sprint 5 has been expanded into a 12-week pre-submission program. Reasoning: Pass 1 → Pass 2C completed faster than the spec budgeted, and shipping the trophy moment (Flow 8 winner UI), tax compliance (Flow 10), and notifications uplifts the v1 launch from "survival MVP" to "credible category-defining product." The submit window is fixed at July 20-25 to allow 6 weeks of App Store review buffer before the Sept 5 launch target.

**Build order — flow-by-flow, ordered by App-Store-blocking impact:**

#### Weeks 1-2 (May 1 → May 14): Foundations + reconciliation
- ~~Docs reconciliation pass~~ ✅ Session 9 (this session)
- **Tab IA restructure** — `app/(app)/(tabs)/` group with home / leagues / browse (stub) / profile. Sprint 1 deliverable that was deferred. Every other Sprint-5 flow assumes it.
- **App icon square-fill 1024×1024 export** + **logo SVG sourcing** — App Store blockers; runs in parallel with engineering.
- **Stripe Connect platform application** — submitted Day 1 of this sprint (~2-4 weeks to approve). **Blocks all production money flow** until approved.

#### Weeks 3-4 (May 15 → May 28): Trophy moment (Flow 8 winner UI)
- **Screen 8.3 Payout in Progress** — dedicated screen, hero animation, recipient status list, reserve callout
- **Screen 8.4 Payout Complete (winner)** — Lottie "The Win" celebration, dollar count-up, YTD context line, share-to-social CTA
- **Screen 8.5 Payout Complete (non-winner)** — empty trophy / "Better luck next year", final-rank card, renewal CTA
- **Lottie "The Win" animation file** — sourced per `BRAND.md` § Animation & Motion + `TECH_SPEC.md` §9.5
- **Auto-routing** from `authorize.tsx` → 8.3 → 8.4/8.5 the moment the last approval tips the league to `closed_authorized`

#### Weeks 5-6 (May 29 → June 11): Tax compliance (Flow 10.3 + dependencies)
- New Edge Function `get-tax-summary` — sums `payouts.amount_cents` per recipient per calendar year
- New `profiles.ytd_winnings_cents` cached column refreshed on every `transfer.created` webhook
- **Screen 10.3 Tax Center** — YTD card, $600 threshold progress bar, Stripe Express deep link, FAQ
- **Screen 10.1 Profile** — YTD card on profile + "Tax Center" row
- **Screen 8.4 YTD context line** — "$X across N leagues this year" + threshold-reached copy
- `potkeeper.app/tax` FAQ static page (web work — Vercel-hosted alongside `/stripe-return`, `/buy-in-return`)

#### Weeks 7-8 (June 12 → June 25): Notifications + retention
- Expo Push token registration at signup + on first launch after upgrade
- Edge Function `send-notifications` — dispatcher, opted-in users only, deep-link payloads
- Wire all 15 events from APP_FLOW Push Notifications table:
  - Member joined / paid / won-week / buy-in reminder
  - Connect-bank reminder (2 weeks before season end)
  - Standings authorization needed
  - Payout sent
  - Bar event RSVP
  - Member-suggested + commish-enabled-followup
  - Sponsorship boost unlocked / code redeemed (formerly deferred Pass 2C `p3`)
  - YTD approaching 1099-K threshold ($500+)
  - First payout that crosses $600 / 1099-K available
- `notifications` user preferences UI (Profile → Notifications)

#### Weeks 9-10 (June 26 → July 9): Activity surfaces + polish tabs
- **Screen 10.2 Activity / Transaction History** — filterable transaction list, expandable receipts, PDF download
- **Tab 6.1.4 Activity Feed** + `league_activity` view backing it
- **Tab 6.1.5 Rules** — read-only league config + "Edit rules" commissioner gate (pre-season only in v1)
- **Lottie "Seal the Pot" splash animation** — first-launch only, fall back to static logo
- **Empty states + error handling pass** — every list / form / data-fetch state has a polished empty + error variant

#### Weeks 11-12 (July 10 → July 25): Pre-flight + submit
- **5.3 specialist pre-submission review** — engaged early July
- **Lawyer-drafted ToS + privacy policy delivery** (mid-July). Replaces templated v1.
- **Geo-block VPN testing** — confirm Checkpoint 1 + Checkpoint 2 enforcement from VA / NJ / WA / NV / etc. via Wireguard
- **App Store screenshots + copy** — six hero screens at iPhone 15 Pro size
- **Privacy nutrition label** + App Store description with state restriction disclosure
- **TestFlight friends-and-family dogfood cohort** — real money, real Sleeper leagues, ~20 users
- **Submit July 20-25**

#### Weeks 13-19 (July 25 → Sept 10): Review + buffer
- 2-3 expected rejection-iteration cycles (5-10 days each)
- Critical bug fixes from FF dogfood
- Web app at `potkeeper.app` for browsers + Android (Expo Router web export — runs in parallel as background work)
- Final marketing push: Reddit / X launch, FF Expo content drops
- **LIVE Sept 5** → NFL kickoff Sept 10

### Sprint 5 stretch backlog (pull from this if tracking ahead of schedule)

In priority order — these are nice-to-have but **do not** expand scope mid-flight:

1. **SetupIntent dedicated screen (Screen 5.0)** + saved payment methods for second-buy-in polish
2. **Refund logic for restricted-state mismatches** — auto-refund instead of ops-manual via Stripe Dashboard
3. **Stripe processing-fee accounting** — actually wire `leagues.fee_payer` differentiating ledger entries
4. **Reconciliation cron** — hourly Stripe ↔ DB drift check
5. **Refund webhook events** — `charge.refunded`, `charge.dispute.created` handling
6. **Dispute resolution flow** for standings authorization (Screen 8.2 dispute branch beyond freeze)
7. **`join_requests` table + paid-join flow** — opens Browse / public-league joining for Phase 2 prep
8. **Custom payout split slider UI** — only if a real user asks
9. **Cron-driven authorization window expiry** — supplements the cron we already have

### Hard cuts — NOT in v1 launch

These are tempting and partially spec'd. **Do not touch them in Sprint 5:**

- **Flow 4 — Create from scratch** (Sleeper import covers v1)
- **Flow 9 — Browse / Bar Leagues / Map View / Bar Partner Page**
- **Admin dashboard / web platform** (§13.4, deferred to Phase 2)
- **Yahoo OAuth** (Phase 2)
- **Charity partners** (already deferred Pass 2C; `payout_charity` enum stays unused)
- **ESPN integration rebuild** (post-launch — dead code stays dead)
- **Dev-only commissioner override on Last Call Dynasty** (`TECH_SPEC.md` §13.5) — revert before TestFlight goes wider than founders

---

## 12.5 App Store Strategy (App Store is the primary launch target)

### Decision: App Store is the launch surface

TestFlight signals "beta product" to bar owners, creators, and serious commissioners — exactly the wrong perception for a money/trust app. **App Store live on Sept 5, 2026** (before NFL kickoff Sept 10) is the v1 launch target. TestFlight is repositioned as an internal beta tool only.

### Three roles, not three tracks

| Surface | Role | Audience |
|---|---|---|
| **App Store (iOS)** | **Primary v1 launch** | All public users, post-Sept 5 |
| **TestFlight** | Gated beta for dogfooding during build | Friends-and-family (June), creator cohort (July). Not a public surface. |
| **Web (potkeeper.app, Expo web)** | Fallback safety net + Android users + browser users | Users who can't / won't use iOS, post-launch backup if App Store delays |

### Timeline to Sept 5 live

| Phase | Dates | What happens |
|---|---|---|
| Sprint 0 | Apr 28 - May 4 | LLC formation, Stripe Connect platform application submitted, Apple Developer account active, fantasy-sports lawyer engaged, domain purchased, ToS draft started |
| Sprint 1-5 | May 5 - July 7 | Build per §12 plan |
| Polish + pre-flight | July 7 - July 20 | 5.3 specialist pre-submission review, lawyer ToS review, App Store screenshots, privacy policy live, copy pass, geo-block VPN testing |
| **Submission** | **July 20-25** | Submit to App Store (allows 6 weeks of review buffer) |
| Review cycles | July 25 - Aug 25 | Expect 2-3 rejection-iteration cycles (5-10 days each) |
| Approval window | Aug 25 - Sept 5 | Final sign-off |
| **LIVE** | **Sept 5** | Marketing push, Reddit/X launch, FF Expo content drops |
| NFL Kickoff | Sept 10 | Full season; 5 days of polish-and-fix runway |

The gating constraint is **submitting July 20-25 with a clean 5.3-compliant build**, not engineering speed.

### Pre-launch spend (non-negotiable for the launch target)

| Item | Cost | When | Why |
|---|---|---|---|
| LLC formation + EIN | $300-500 + state filing | This week | Apple wants entity backing; Stripe Connect requires it; ToS points at it |
| Fantasy-sports lawyer | $2,000-4,000 | Engage mid-May, deliver mid-July | ToS, Privacy Policy, mandatory arbitration clause, state restriction copy |
| 5.3 specialist for pre-submission review | $1,000-2,000 | Engage early July | Knows current Apple reviewer flags; saves 4-8 weeks of rejection cycles |
| App Store Developer Program | $99/yr | This week | Required for submission |
| Stripe Connect platform application | $0 | This week | 2-4 weeks to approve; blocks all money flow |
| **Total** | **$3,500-7,000** | — | — |

Cheaper than a feature engineer for a month, and the difference between launching Sept 5 vs December 5.

### Apple 5.3 compliance checklist (v1 hard requirements)

The following must be true BEFORE first submission, or first review is a hard rejection. Items are ordered by frequency-of-rejection in observed 5.3 reviews:

- [ ] **Mandatory arbitration clause + class-action waiver** in ToS (lawyer-drafted) — most common rejection reason
- [ ] **Hard geographic enforcement** (not just disclosure). Reviewers test from VPNs. ✅ — passed via Checkpoint 1
- [ ] **Age verification at signup** (18+, hard gate, not a checkbox). ✅ — locked
- [ ] **No Apple In-App Purchase** used for buy-ins or payouts (external Stripe Checkout via in-app browser). ✅ — locked
- [ ] **App is free to download** (no install paywall). ✅
- [ ] **Privacy policy** explicitly covers financial data handling and Stripe's role (lawyer-drafted)
- [ ] **No gambling-coded marketing language** ("bet," "wager," "stakes," "odds"). ✅ — locked in `BRAND.md`
- [ ] **App Store description discloses** geographic restrictions and skill-based contest nature
- [ ] **Contact email for support**, responded to within 24 hours during review cycles
- [ ] **Operated by a registered legal entity** (LLC) with valid EIN

### Don't argue with reviewers

Cardinal rule of 5.3 review: **whatever Apple asks for, do it**. Even if the request seems wrong or the reviewer seems junior. Founders who argue spend 3 months in rejection hell. Founders who comply ship in 6-8 weeks.

### Realistic risk and the parachute

Even with everything dialed in, there's ~25% probability App Store approval slips past Sept 5. The fallback (NOT the plan):

- TestFlight with public link → soft launch to FF Expo + Reddit cohort while waiting
- Web app at `potkeeper.app` for browsers and Android
- Marketing communicates "Available now via early access — full App Store launch coming soon"

Uncomfortable but recoverable. The web app gets built anyway as a free byproduct of Expo Router web export — it's $0 incremental work to keep it ready.

### Google Play (Android) — Phase 2

Android has its own gambling-app review process: faster reviews on average, but stricter on geo-fencing (Google Play does not allow real-money gaming apps in many countries; we'll need to fence the Play Store listing too). Defer to Phase 2 (Q1 2027). Web app covers Android users in the meantime.

---

## 13. Open Technical Questions

- **Apple Push vs FCM**: Expo Push abstracts both. Confirm we don't need bare Apple Push for any critical path.

## 13.4 Web platform / admin dashboard (deferred to Phase 2)

The mobile app ships first; an authenticated web dashboard for PotKeeper ops is intentionally deferred and bundled with the web build (§13.5 below). When it lands, the dashboard must cover:

**Sponsorship operations**
- Issue `sponsorship_codes` rows: code string (auto-generated, uppercase), `boost_max_cents`, `match_ratio`, `partner_name`, `partner_contact_email`, `expires_at`, `conditions` JSON. No client-facing seed — until this UI exists, codes are inserted via Supabase dashboard SQL.
- Status board: `issued` / `redeemed` / `funded` / `forfeited` / `cancelled`, filterable by partner, with the linked `redeemed_for_league_id` and league name.
- One-click cancel (sets `status = 'cancelled'`, lets `sponsorship-boost-tick` cron forfeit the linked league on next run).
- Manual fund / forfeit override (bypass the cron's threshold check) for partner exceptions.

**Bar partner CRUD**
- `bar_partners` insert/edit (name, city, state, logo_url, default_incentive). Today insertions are dashboard-SQL only.
- League → bar assignment helper that sets `leagues.bar_partner_id` + optional `bar_incentive_text` override.

**Reconciliation + ops tools**
- Pot ledger viewer per league with running balance vs `league_pot_balance` MV — flags drift.
- Force `refresh_league_pot_balance` button.
- Manual force-refund for stuck buy-ins (writes `refund_full` ledger row + Stripe refund).
- Override commissioner / suspend league.
- Buy-in dispute counter inspector (rare manual decrement if Stripe webhook misfires).
- Re-run cron jobs on demand: `auto-finalize-leagues`, `release-reserves`, `sponsorship-boost-tick`.

**Auth / access**
- Web app must gate by a `profiles.is_staff` flag (column doesn't exist yet — add when building); RLS policies stay closed to clients.

## 13.5 Known Tech Debt (tracked, not yet scheduled)

- ~~**`SessionProvider` doesn't subscribe to `supabase.auth.onAuthStateChange`**~~ — **RESOLVED Session 3.** `context/index.tsx` now subscribes to `supabase.auth.onAuthStateChange` and pulls initial state via `getSession()`; renders a centered spinner instead of children while hydrating, so consumers never observe a `null` user during the race window. Routing was consolidated into a `RoutingGate` component inside the provider (single auth-state subscriber across the app). The workaround in `sleeper-link.tsx` (manual `getSession()` at call sites) was removed. `Auth.tsx`'s sign-up flow now goes through the provider's `signUp` so we have one place to layer eligibility checks (`APP_FLOW.md` Flow 1 Checkpoint 1) later.
- **`ESPNLogin.tsx` references removed `espn_s2`/`espn_swid` columns**. Dead code today (the home-screen ESPN button shows "Coming soon" instead of routing here). Will be rewritten when ESPN is ported to Supabase Edge Functions + Vault per §4.2.
- **App icon source needs a square-filled export** (`assets/images/potkeeper-icon.png`). Current export is the rounded-square design with transparent corners — when iOS applies its system corner mask, the transparency leaks through. Need a 1024×1024 PNG with the green gradient filling the entire square, no rounded corners, white pot+crown+keyhole centered. Block before App Store submission, not before TestFlight.
- **Logo source files not vector**. All four PotKeeper logo variants (`potkeeper-{primary,stacked,icon,mark}.png`) are PNG raster exports from ChatGPT. We should commission an SVG export of the mark for crisp scaling on all densities (Lottie splash, push notification badge, web favicon) before public launch.
- **Theme persistence after toggle**. `ThemeToggle` writes the new value to `storage.setItem('theme', …)` but nothing reads it on app start, so user overrides reset to system pref on cold launch. Acceptable for v1 (matches `APP_FLOW.md` intent: phone-following by default). Persist when toggle moves into Settings screen.
- **Sleeper-link as Tabs.Screen with `href: null`**. Wizard-style flows shouldn't be tab screens — they stay mounted between visits, which caused a stuck-state bug fixed via `useFocusEffect` reset. Cleaner long-term: hoist `sleeper-link`, `league/[id]`, and future modal flows into a stack route group above tabs (e.g. `app/(modals)/`). Defer to when adding the buy-in setup flow.
- **Dev-only commissioner override on Last Call Dynasty**. For Session 3 buy-in flow testing, we manually flipped `is_owner` on `league_members` (away from `nfldraftscout`, toward `ef2467`) and set `leagues.commissioner_profile_id = ef2467`. Real Sleeper data has Matt Miller as commish. Revert before any production data: `update league_members set is_owner=true where league_id=... and external_user_id='989727218148470784';` then mirror inverse on ef2467's row, then null out `leagues.commissioner_profile_id` and `commissioner_external_user_id`.
- **`leagues` UPDATE policy missing WITH CHECK**. Current policy gates UPDATE on `(select auth.uid()) = commissioner_profile_id` (USING clause only). Without WITH CHECK, a malicious commissioner could in theory transfer commissioner role to another profile in a single update. Practical risk is near-zero (only commissioner can update) but harden with `with check ((select auth.uid()) = commissioner_profile_id)` next migration touching this policy.
- **Custom payout split UI deferred**. Buy-in setup screen ships with three presets (Standard / Winner takes all / Top half). The "custom" preset slot exists in the data model (`payout_split.preset = 'custom'`) but no slider UI yet — wire when a user actually asks for non-preset distributions, per `APP_FLOW.md` Screen 4.3.
- ~~**Checkpoint 1 blocks via `geo_status='suspended'`, not auth deletion**~~ — **RESOLVED Session 3 (same day).** Initially we marked failed-eligibility profiles as `geo_status='suspended'` rather than deleting them. The fallout: a blocked email was "burned" (Supabase signUp returns a user-shaped object with empty `identities` for already-registered emails, so retries silently no-op on the client). Fix: `supabase/functions/eligibility-fail-cleanup/index.ts` validates the user's JWT then calls `auth.admin.deleteUser` (cascades to profiles). The eligibility screen invokes it before navigating to /underage or /restricted, passing the email through nav params for the waitlist capture. SessionProvider's `signUp` now also detects the empty-identities response and returns a real "account already exists" error so legitimate duplicate-email signups surface a UI alert instead of dropping silently.
- ~~**Stripe Connect return page can't auto-close the in-app browser**~~ — **RESOLVED Session 4.** `stripe-create-connect-account` now points `return_url`/`refresh_url` at `https://potkeeper.app/stripe-return` (Vercel-hosted, source in `~/Desktop/Projects/potkeeper-site/`). That page does an immediate `window.location.replace('potkeeper://stripe-return')` (with `<meta http-equiv="refresh">` and a button as fallbacks). The wallet uses `expo-web-browser.openAuthSessionAsync(stripeUrl, 'potkeeper://stripe-return')` which iOS auto-dismisses the moment the redirect to the custom scheme fires. We also moved off the Supabase-hosted `stripe-return` Edge Function — the iOS in-app browser was rendering its HTML as raw source; the Vercel-hosted page renders normally on the same iOS browser, so the previous quirk was domain/CDN-specific and not worth chasing further.
- ~~**App scheme is still `myapp`**~~ — **RESOLVED Session 4.** `app.json` `"scheme"` is now `"potkeeper"`, matching the brand and the `potkeeper://stripe-return` redirect target. Required a `expo prebuild --clean && expo run:ios` rebuild, batched with this session's other native config changes.
- ~~**Stripe Connect webhook not wired**~~ — **RESOLVED Pass 2C.** `stripe-webhook` now handles `account.updated` (refresh `profiles.stripe_connect_status` / `payouts_enabled` / `details_submitted` / `requirements_disabled_reason` in real time) and `account.application.deauthorized` (flips status back to `none` and clears the account id). Wallet still does refresh-on-focus as a belt-and-suspenders catch-up. `STRIPE_WEBHOOK_SECRET` was already configured during Flow 5; no new secret needed.
- **`__DEV__` debug shortcut to wallet on home screen**. `app/(app)/index.tsx` renders a `DevDebugTools` block (only when `__DEV__ === true`) that links to `/(app)/wallet`. We need this because the production trigger for Flow 7 (end-of-season "claim your winnings" card on home / league detail, per `APP_FLOW.md` Flow 7) doesn't exist yet — without the dev shortcut, there's no way to reach the wallet during development, since settings now hides the row when `stripe_account_id IS NULL`. Remove this `DevDebugTools` block (and its empty-state wrapper) the moment Flow 8 wires up the real payout-trigger card.
- **Commissioner gating on buy-in flow not enforced yet**. `app/(app)/league/[id]/buy-in.tsx` lets commissioners configure the pot regardless of Stripe Connect status. The actual gate (must be `payouts_enabled=true` before configuring or before buy-ins open) is deferred to the buy-in payment slice — at that point the gate matters because money flow is real.
- **`restricted_state_waitlist` INSERT policy is `with check (true)`**. Supabase advisor flags this as "always-true RLS." It's intentional — the table needs to accept writes from both anon (Phase 2 public landing page) and authenticated (signup gate) and we have no good per-row predicate yet. The unique `(email, state)` constraint and the absence of any SELECT/UPDATE/DELETE policy make it write-only from the client, so leakage is bounded. Tighten with a length/format predicate next time we touch this migration.
- **Web build for pre-App-Store launch**: how much of Phase 1 functionality should we ship to web in case App Store review delays kill the NFL season launch? Probably: auth, onboarding, league create/convert, buy-in, league dashboard. Skip: native push, deep linking, Sleeper webview-style flows.
- **Yahoo OAuth**: Phase 2, but should we sketch the OAuth callback handling now?
- **Charity partner curation**: which 5-10 charities to seed? Boys & Girls Club of America, Tunnel to Towers, St. Jude, JDRF, local-team-named foundations?
- **Bar partner CMS**: do we build an admin UI for adding bars in v1, or seed manually via Supabase dashboard?
- **App Store binary name**: "PotKeeper" plain, or "PotKeeper - Fantasy League Pot" for SEO?
- **Float yield capture**: do we capture interest on cash held in Stripe balance? Stripe doesn't pay interest by default; would require sweeping to Treasury (different product). Defer until material AUM.
- **Rate limit on join requests**: how do we prevent a spam attack where one bad actor floods 100 leagues with join requests? Probably: 5 active requests per user, reset on transition.
- **Cron schedule migrations not committed locally**. The `pg_cron` jobs (`potkeeper-auto-finalize`, `potkeeper-release-reserves`, `potkeeper-sponsorship-tick`) were created via SQL editor / MCP rather than versioned migrations. Remote has a `schedule_auto_finalize_cron` migration with no local file (`supabase migration list` shows the gap). The release-reserves and sponsorship-tick `cron.schedule` calls run on the user's Session 4 conversation also have no local file. Capture all three as `supabase/migrations/<ts>_schedule_crons.sql` so a fresh `supabase db reset` reconstructs the full schedule. Low risk today (the live project has them set up correctly), but blocks reproducible local dev.
- **Migration version drift between local files and remote `schema_migrations`**. Local files use `20260501000001`-style synthetic timestamps; remote has MCP-applied versions stamped at apply-time (`20260501144754` etc.). Pass 2C migrations were repaired (`20260502000015`/`16`/`17`/`18` all marked applied locally, MCP duplicates reverted). The older 13 still drift. Re-run the same `supabase migration repair --status applied <local> && --status reverted <remote_dup>` pattern next time you touch this area to clean up.

---

*Last updated: May 1, 2026 (Session 9 — Pass 2C completion + auto-link trigger + sponsorship view RPC + league invite affordances; expanded 12-week Sprint 5 plan + codebase layout reconciled to shipped flat structure). Updated as build decisions land.*
