# PotKeeper — App Flow & Screen Specification

> Use this doc to generate Claude Design / Figma mocks. Every screen, every state, every interaction. Phase 1 (v1 launch) is the focus; Phase 2 and Phase 3 screens are sketched at the end.

---

## For Claude Design / AI Mocking Tools (read this first)

**Product**: PotKeeper, a mobile app that holds fantasy-league money in escrow and auto-pays winners based on real standings from Sleeper, ESPN, and Yahoo. Replacement for LeagueSafe + Venmo for fantasy money leagues.

**Tagline**: "Keep the pot. Skip the drama."

**Vibe in one sentence**: Robinhood meets Sleeper meets Stripe Dashboard. Trust-forward, dark-mode primary, sports-confident, never gambling-coded.

**Target device**: iPhone 15 Pro (393 × 852 pt) and Pixel 8 (412 × 915 pt). Mobile-first, single column. Web later.

**If asked to generate one screen, default to one of these six hero screens** (described in detail below):

| # | Screen | Why it sells the product |
|---|---|---|
| 1 | **Home with leagues** (Screen 2.2) | First impression for returning users — money + leagues at a glance |
| 2 | **Leagues tab → From Sleeper sub-tab** (Screen 3.1.c) | The killer onboarding visual — "your existing leagues, with one tap to convert" |
| 3 | **Convert Existing League** (Screen 3.2) | The 60-second league setup — pre-filled from Sleeper, three controls |
| 4 | **Pot tab during season** (Tab 6.1.2) | The iconic in-season screen — pot, payout breakdown, sponsorship banner if applicable |
| 5 | **Standings authorization with countdown** (Screen 8.2) | The screenshot for Reddit — locks PotKeeper as a category-defining product |
| 6 | **Payout complete — winner** (Screen 8.4) | The trophy moment — Lottie celebration + the dollar count-up |

**Color tokens to use everywhere** (don't substitute):

| Use | Hex | Token |
|---|---|---|
| Background (dark mode) | `#0A0A0F` | `bg` |
| Surface | `#15151A` | `surface` |
| Card | `#1C1C24` | `card` |
| Border | `#2A2A33` | `border` |
| Primary text | `#FAFAFA` | `text` |
| Muted text | `#9999A3` | `text-muted` |
| **Brand green** (CTAs, brand) | `#22C55E` | `brand` |
| Brand green pressed | `#16A34A` | `brand-pressed` |
| **Trophy gold** (winners only) | `#F59E0B` | `gold` |
| Alert red | `#EF4444` | `alert` |
| Info indigo | `#6366F1` | `info` |

**Logo**: rounded green pot (`#22C55E`) with a gold crown (`#F59E0B`) on top and a white keyhole centered on the body. Wordmark "potkeeper" lowercase, two-tone — "pot" in brand green, "keeper" in light gray.

**Hard rules for every mock**:
1. Money is always tabular figures, semibold weight, prominent. Never buried.
2. No flashing colors, no slot-machine animations, no neon. Closer to Robinhood / Apple Cash than DraftKings.
3. Every money-touching screen carries a trust micro-signal: "held in Stripe escrow," "verified by Stripe," "PotKeeper never has access to your bank login."
4. Empty states matter as much as filled states — show both when relevant.
5. Avoid "wager," "bet," "stakes," "odds," "gamble" in any copy (App Store 5.3 sensitivity).
6. The Unconverted League Card must be visually distinct from the PotKeeper League Card (dashed border or outlined style) so users intuit "this is my Sleeper league we're showing you, not yet ours."

---

## Design System

### Vibe
Modern, dark-mode primary, sports-confident but not gambling-neon. Think Robinhood meets Sleeper meets Stripe Dashboard. Trust-forward. Clean typography. Fantasy users live in dark mode, build for that first.

### Core Brand Identity
- **Name**: PotKeeper
- **Tagline**: "Keep the pot. Skip the drama." (canonical; see `BRAND.md`)
- **Wordmark**: lowercase two-tone "potkeeper" — "pot" in brand green, "keeper" in light gray (dark mode) / dark gray (light mode). Logo mark: rounded green pot with a gold crown on top and a white keyhole centered on the body.
- **Vocabulary**: "pot" (the league fund), "keeper" (this app), "buy-in", "payout". Lean into fantasy-native language. Avoid: "wager," "bet," "stakes," "odds," "gamble" (App Store 5.3 sensitivity).

### Colors (anchored to existing NativeWind/shadcn tokens in `global.css`)

**Dark mode (primary):**
- Background: `#0A0A0F` (near-black with slight blue undertone)
- Surface: `#15151A`
- Card: `#1C1C24`
- Border: `#2A2A33`
- Primary text: `#FAFAFA`
- Muted text: `#9999A3`
- **Brand green** (primary CTAs, links, brand identity): `#22C55E` — money-positive *is* brand-positive, by design
- **Brand green pressed**: `#16A34A` (hover, pressed states, deeper accent)
- **Accent gold** (winners, trophy moments, championship UI): `#F59E0B`
- **Accent red** (alerts, refunds, dispute states): `#EF4444`
- **Accent indigo** (informational, secondary actions, links to external docs): `#6366F1` (used sparingly)

**Light mode (secondary, supported but not the focus):**
- Background: `#FFFFFF`
- Surface: `#F5F5F7`
- Same accent colors

**Color philosophy**: green as primary brand reinforces "we are about money flowing the right way." Gold reserved for trophy/winning moments only — never as a UI primary, only as a celebration accent. Red strictly for negative states. Indigo as a quiet third color when green and gold would both be wrong.

### Typography
- Headings: Inter Display or Geist, semi-bold to bold
- Body: Inter, regular
- Numbers (especially money): tabular figures, slightly heavier weight (Inter SemiBold for amounts)
- Money is always displayed with currency symbol, comma separators, and 2 decimals when over $100, no decimals when under (e.g., "$50" but "$1,234.56")

### Components (RNR / shadcn primitives)
Already installed: Avatar, Button, Card, Progress, Tabs, Tooltip. Need to add: Sheet (bottom sheet), Dialog, Input, Select, Slider, Skeleton, Toast.

### Global UI Conventions
- Sticky bottom CTA on action screens (big primary button)
- Top bar: back chevron, screen title (centered), optional right action
- Card-based content with 16px padding, 12px border radius
- 24px section spacing, 16px card spacing, 8px element spacing
- Empty states always have an illustration placeholder + CTA
- Loading states use skeletons, not spinners (except for true async like payment processing)

---

## Information Architecture

### Tab Bar (bottom, 4 tabs)
1. **Home** — feed, summary, activity, quick actions
2. **Leagues** — your leagues catalog with platform sub-tabs (active PotKeeper leagues + your unconverted Sleeper/ESPN/Yahoo leagues)
3. **Browse** — discover leagues to join (near me, bar leagues, public)
4. **Profile** — settings, connections, transaction history

Wallet is folded into Profile under "Activity" — money context lives on each league page anyway, no need for a dedicated tab.

### Modal/Sheet Patterns
- **Bottom sheets** for: confirmations, quick actions, info popovers
- **Full screen modals** for: create league flow, convert league flow, payout flow, fantasy account connection
- **Native dialogs** for: destructive confirmations only

### Permission Model

**Who can do what on a league:**

| Action | Commissioner | Member | Non-member |
|---|---|---|---|
| Convert a fantasy league to PotKeeper | ✅ if commissioner of that league on the source platform | ❌ (can suggest) | ❌ |
| Create a new PotKeeper league | ✅ | ✅ | ✅ |
| Edit league rules (buy-in, split, charity) | ✅ pre-season; with member vote mid-season | ❌ | ❌ |
| Invite members | ✅ | ✅ via share link | ❌ |
| Remove a member | ✅ | ❌ | ❌ |
| Pay buy-in | ✅ | ✅ | ❌ |
| Authorize final standings | ✅ | ✅ (one vote each) | ❌ |
| Trigger payout | Automatic after authorization window; commissioner can manually fire if all auth received | ❌ | ❌ |

**Important:** the commissioner of a fantasy league (Sleeper/ESPN/Yahoo) is the only person who can convert it to PotKeeper. We detect this via the source platform's API. If a non-commissioner member sees the league in their "From Sleeper" list, the CTA is "Suggest PotKeeper to [Commissioner Name]" instead of "Add PotKeeper" — sends a deep-link invite to the commissioner.

**Eligibility (v1)**: every PotKeeper user must be (a) 18+ and (b) in a compliant US state (not WA, ID, HI, MT, NV, or parts of LA). This is enforced at signup as a hard block — restricted-state users cannot create accounts and cannot participate in any league. See `TECH_SPEC.md` §10 for the three-checkpoint enforcement architecture (signup declaration → Stripe SetupIntent billing verification → webhook reconciliation).

**Cross-state leagues are not supported in v1.** A league cannot include both eligible-state and restricted-state members. When a Sleeper/ESPN/Yahoo league is converted, members in restricted states will be unable to sign up; the commissioner will receive a quiet notification ("Steve M. couldn't join — PotKeeper isn't available in their state"). The commissioner can replace them or proceed without them. If the source-platform commissioner is in a restricted state, the league cannot be converted — they need to pass commissioner role on Sleeper to an eligible member first. (Phase 2 may add free-to-play guest mode or league-wide manual mode if v1 abandonment data justifies the build.)

---

## Flow 1: Onboarding & Auth

### Screen 1.1 — Splash / Welcome

**Purpose**: First impression. Convey trust, simplicity, the core promise.

**Layout (top to bottom):**
- Status bar
- Centered logo mark (~96px): rounded green pot, gold crown on top, white keyhole centered on the body. Lottie-rendered "Seal the Pot" animation plays once on first launch (see `BRAND.md` § Animation & Motion); subsequent launches show the static logo.
- Two-tone wordmark "potkeeper" (32pt) below logo
- Tagline: "Keep the pot. Skip the drama." (16pt, muted)
- Spacer
- Primary button: "Get Started" (full width, brand green `#22C55E`)
- Secondary text link: "I already have an account" (muted)
- Bottom: tiny disclaimer "Funds held securely via Stripe Connect"

### Screen 1.2 — Sign Up / Sign In

Standard auth screen. Supabase auth supports email/password, Apple, Google, Discord (consider adding because fantasy users often have Discord).

**Layout:**
- Top bar with back chevron
- "Create your account" heading
- Email input
- Password input (min 8 chars, show/hide toggle)
- Primary button: "Create account"
- Divider with "or"
- "Continue with Apple" button (white on dark)
- "Continue with Google" button
- "Continue with Discord" button (Discord blurple)
- Footer: "By signing up you agree to our Terms and Privacy Policy"

**Sign In variant**: same layout, "Welcome back" heading, "Forgot password?" link added.

### Screen 1.2.5 — Eligibility Check (NEW: Checkpoint 1)

**Purpose**: First-run hard gate. Confirm user is 18+ and in a compliant state before account becomes usable. This is enforced before any league interaction is possible.

**Layout:**
- Top bar with progress indicator (step 2 of 3)
- "A few quick details" heading
- Subtitle: "We need this to keep PotKeeper compliant in your state."
- **Date of Birth** picker (month / day / year, native picker)
- **State of residence** dropdown (US states only, no territories in v1)
- Disclosure block: *"PotKeeper is available to US residents 18 and older in eligible states. Members in WA, ID, HI, MT, NV, and parts of LA can't join right now. We use this info only for compliance."*
- Primary button: "Continue"
- Tiny footer: "By continuing you confirm this information is accurate. False information may result in account termination."

**Logic:**
- If DOB → age < 18: hard stop screen (Screen 1.2.6a)
- If state ∈ restricted list: hard stop screen (Screen 1.2.6b) with email capture
- If both pass: write `profiles.date_of_birth`, `profiles.location_state`, set `geo_status = 'declared'`, proceed to Screen 1.3

### Screen 1.2.6a — Underage Block

**Layout:**
- Centered illustration (gentle, not punitive)
- Heading: "PotKeeper is 18+"
- Subtitle: "PotKeeper requires you to be 18 or older to use the app. Come back when you're old enough — fantasy leagues will still be here."
- Single button: "I understand"
- Tap → kicked back to Welcome screen, profile not created

### Screen 1.2.6b — Restricted State Block

**Layout:**
- Centered illustration (subdued, hopeful)
- Heading: "Not in [State Name] yet"
- Subtitle: "PotKeeper isn't available in your state right now because of state law. We're working on changing that."
- Email input (pre-filled with their signup email): "Get notified when PotKeeper comes to [State]"
- Primary button: "Notify me"
- Secondary text link: "Why not?" → opens info sheet explaining state-by-state legal landscape
- Tap notify → write to `restricted_state_waitlist` table, show confirmation toast, kick back to Welcome
- Profile is NOT created; email captured separately

### Screen 1.3 — Welcome / Connect Your Fantasy Account

**Purpose**: First-run experience after auth. Get them to connect Sleeper (primary) or ESPN. Connecting unlocks the Leagues tab's "From Sleeper / From ESPN" sub-tabs, which is the killer onboarding path.

**Layout:**
- Top bar with skip option ("Skip for now")
- "Connect your fantasy account" heading
- Subtitle: "We'll show all your leagues so you can add PotKeeper to any of them. We never see your password."
- Three platform cards stacked:
  - **Sleeper** (recommended badge, lit up): logo, "Free, fast, no login needed" subtitle, chevron right
  - **ESPN**: logo, "Sign in with ESPN" subtitle, chevron right
  - **Yahoo**: logo, "Coming soon" badge, disabled state
- Footer link: "Why do we need this?" → opens info sheet

### Screen 1.4a — Connect Sleeper

**Layout:**
- Top bar with back
- "Connect Sleeper" heading
- Sleeper logo
- Input: "Enter your Sleeper username"
- Helper text: "We'll pull your leagues automatically"
- Primary button: "Connect"
- Below button, subtle: "Don't have a Sleeper account? Get one →"

**Loading state**: "Finding your leagues..." with skeleton league cards
**Success state**: list of leagues found with member counts; "Continue" CTA → routes to Leagues tab "From Sleeper" sub-tab
**Error state**: "Couldn't find that username" + retry

### Screen 1.4b — Connect ESPN

This screen launches the existing WebView flow (`ESPNLogin.tsx`).

**Layout:**
- Top bar with back
- "Sign in with ESPN" heading
- ESPN logo
- Body copy: "We'll open ESPN's login page in a secure window. Your password never touches our servers."
- Trust badges:
  - 🔒 "End-to-end secure"
  - ⏱ "Re-authenticate every 30 days"
  - 👁 "We can only read your league data"
- Primary button: "Open ESPN sign in"
- Tertiary link: "How does this work?" → bottom sheet with explanation

The actual WebView is system-styled.

---

## Flow 2: Home / Dashboard

### Screen 2.1 — Home (empty state)

**Purpose**: New user with no PotKeeper leagues yet. Push toward conversion (preferred) or create.

**Layout:**
- Top bar: PotKeeper wordmark, profile avatar top right
- Hero card with illustration: "Let's get your league set up"
- Two equal-weight CTA cards stacked:
  - **Add PotKeeper to an existing league** (primary): "We'll show your Sleeper / ESPN leagues" → routes to Leagues tab → first available platform sub-tab
  - **Create a new league** (secondary): "Start from scratch" → starts Flow 4
- Below: "Got an invite code?" with input field
- Activity section (empty state with "When you join a league, you'll see updates here")

### Screen 2.2 — Home (with leagues)

**Purpose**: Returning user's primary surface. Quick scan + recent activity.

**Layout:**
- Top bar: "Home" + profile avatar + bell (notifications) icon
- Hero summary card:
  - "Your active money" (label)
  - Big number: total $ across all your league pots that you have a stake in
  - Sub-label: "across X leagues"
  - Tiny chart/sparkline if we have it
- Section: "Your Leagues" — top 2-3 most active leagues as horizontal scroll cards (full catalog lives in Leagues tab)
- Section: "Activity" with vertical feed:
  - "[Member] paid into [League]"
  - "[League] started Week 5"
  - "[League] payout in 3 days"
  - "[Bar Name] sponsored a new league near you"
- FAB or sticky bottom: "+ New" → bottom sheet with "Add to existing league" / "Create new" / "Join via code"

### Component: League Card

**Purpose**: Reusable component shown on Home, Leagues tab, Browse, Profile.

**Layout:**
- Card with rounded corners
- Top row: league name (bold), small chevron right
- Sub-row: platform badge (Sleeper logo) + sport (NFL '26)
- Middle: progress bar showing % of season complete (visual: filled bar)
- Stats row (3 columns):
  - Pot size: "$1,200"
  - Members: "12/12"
  - Your rank: "#3"
- Status pill bottom right: "In Season" / "Pre-Season" / "Payout Pending" / "Complete"
- If sponsored by a bar: bar logo top right corner

### Component: Unconverted League Card (variant)

**Purpose**: Shown in Leagues tab "From Sleeper / From ESPN" sub-tabs. Visually distinct from PotKeeper league cards so the user knows this is their existing league not yet ours.

**Layout:**
- Card with subtle dashed border (or outlined style) to signal "not yet PotKeeper"
- Top row: league name as it appears on the source platform
- Sub-row: platform badge (Sleeper/ESPN logo) + member count
- Middle: small "Your role: Commissioner" or "Your role: Member" badge
- CTA bottom right (different per role):
  - **If commissioner**: solid primary button "+ Add PotKeeper"
  - **If member**: outline button "Suggest to [Commish Name]"
  - **If already converted**: green badge "✓ Managed"

---

## Flow 3: Leagues Tab (THE KILLER FLOW)

### Screen 3.1 — Leagues Tab Overview

**Purpose**: The catalog of all your leagues across platforms. Primary place to manage active PotKeeper leagues *and* convert existing fantasy leagues.

**Layout:**
- Top bar: "Leagues" + search icon + add icon (top right)
- Scrollable horizontal pill nav:
  - **Active** (default) — your in-season PotKeeper leagues
  - **Past** — completed/archived PotKeeper leagues
  - **From Sleeper** — only shows if Sleeper connected
  - **From ESPN** — only shows if ESPN connected
  - **From Yahoo** — only shows if connected (Phase 2)
- Each pill has a count badge: "Active (3)", "From Sleeper (5)"
- Below pills: scrollable list of league cards based on selected pill

### Screen 3.1.a — Active Sub-tab

- List of PotKeeper League Cards (full component above)
- Sort options (top right): Most active / Newest / Highest pot
- Empty state: "No active leagues. Add PotKeeper to a Sleeper league →" or "Create one →"

### Screen 3.1.b — Past Sub-tab

- List of completed leagues with final standings inline
- Each card has "Run it back next season" CTA

### Screen 3.1.c — From Sleeper Sub-tab

- Top: "Your Sleeper leagues" + small "Last refreshed 2m ago • Refresh" link
- List of Unconverted League Cards
- Each card shows your role and the appropriate CTA
- Empty state: "We didn't find any Sleeper leagues. Make sure your username is right." + "Reconnect Sleeper" link

**Already-on-PotKeeper state machine** (`app/(app)/sleeper-link.tsx` cross-checks each Sleeper league ID against the `leagues` table on lookup):

- **Not yet on PotKeeper, you are commish on Sleeper** → primary CTA "Add to PotKeeper" (the canonical convert flow, Screen 3.2).
- **Not yet on PotKeeper, you are *not* commish on Sleeper** → no add CTA; row reads "Suggest to {commish name}" with a Share button.
- **Already on PotKeeper, you are the PotKeeper commish** → card renders subdued with an "Already added" pill + a single "View league" CTA that deep-links to League Detail.
- **Already on PotKeeper, you are *not* the PotKeeper commish but you are linked** → "Already added" pill + "View league" CTA.
- **Already on PotKeeper, the PotKeeper commish hasn't finished setup yet** → "Already added" pill + "View league" + "Notify {commish name}" Share button (native Share sheet, prefilled with a league deep link and a "set up the pot" nudge). Same Share helper as the league header invite buttons (see Screen 6.1).

This prevents duplicate-import attempts and gives non-commissioner members a one-tap path to nudge their commish without bouncing through copy/paste.

After import, the success step inside the Sleeper-link wizard surfaces a collapsed **"Have a sponsorship code?"** disclosure (commissioner-only) that routes the user into the buy-in `SponsorshipSetupSection` rather than running its own redemption form. See `TECH_SPEC.md` §3.11.

### Screen 3.1.d — From ESPN Sub-tab

- Same pattern as Sleeper
- If cookies expired: top banner "ESPN session expired. Reconnect to see leagues." → opens WebView re-auth

### Screen 3.1.5 — Eligibility Warning (NEW: shown before Screen 3.2)

**Trigger**: Tap "+ Add PotKeeper" on an unconverted league card where you're the commissioner. **Before** the main convert flow, we show a one-time eligibility warning.

**Purpose**: Set expectations honestly. We can't pre-check member states (we don't have their addresses yet) but we can warn the commissioner so they're not surprised when a member can't join.

**Layout:**
- Top bar: back + "Add PotKeeper to [League Name]"
- Centered illustration (gentle warning icon, not alarming)
- Heading: "Heads up before you continue"
- Body copy:
  > *"PotKeeper requires every league member to be **18 or older** and in an **eligible state**.*
  >
  > *Members in WA, ID, HI, MT, NV, or parts of LA can't join PotKeeper, even if you create the league. Members under 18 can't join either.*
  >
  > *We can't check this until each member signs up. If anyone in your league is in a restricted state, your league will move forward without them — they'll be notified PotKeeper isn't available where they are.*
  >
  > *Cross-state leagues with restricted-state members aren't supported in v1, but we're working on it."*
- Disclosure: list of restricted states + "Members under 18 are also ineligible"
- Primary button: "Continue — I understand"
- Secondary text link: "Not now"
- Tertiary text link: "Why these states?" → opens info sheet

**Logic**:
- Tap "Continue" → log `geo_block_warning_shown` event → proceed to Screen 3.2
- Tap "Not now" → log `geo_block_abandoned` event → return to Leagues tab
- This warning shown only once per source-platform league (don't re-prompt if commissioner returns)

### Screen 3.2 — Convert Existing League (commissioner path)

**Trigger**: After acknowledging the eligibility warning (Screen 3.1.5).

**Purpose**: The fastest path to a working PotKeeper league. Most fields pre-filled from source platform.

**Layout:**
- Top bar: back + "Add PotKeeper to [League Name]" + step indicator
- Pre-filled summary card (read-only):
  - League name (editable inline)
  - Platform: Sleeper (with logo)
  - Members found: 12 (with avatar stack)
  - Sport: NFL '26
  - Status: Pre-season / In-season / Complete
- "We just need a few details" heading
- Buy-in input (currency formatted, presets: $25 / $50 / $100 / $200 / $500)
- Payout split selector (presets + custom, same as Flow 4)
- Optional charity toggle (collapses if off)
- Fee handling toggle: "Members cover the 2.5% fee" / "I'll cover it"
- **Sponsorship code field** (collapsed by default, "Have a sponsorship code?" disclosure):
  - Input: monospace text field, auto-uppercases as you type (e.g., `PKBOOST-FALCONS-2026`)
  - Validate button: "Apply"
  - On valid code: green callout *"Sponsored: PotKeeper will match buy-ins up to $X. Boost unlocks once 80% of members pay in by Sept 8."*
  - On invalid code: red inline error *"Code not recognized, expired, or already used."*
  - On already-redeemed code: red inline error *"This code has already been used for another league."*
  - See `TECH_SPEC.md` §3.11 for backend logic
- Live preview card: "Total pot: $X • 1st: $Y • 2nd: $Z • Charity: $C"
  - If sponsorship code applied and valid: extra line *"Sponsorship boost: +$X (unlocks at 80% paid)"*
- Sticky bottom: "Continue → Invite members"

### Screen 3.2.5 — Source-Platform Commissioner is Restricted (edge case)

**Trigger**: If at the moment of conversion we detect the commissioner's own profile has `geo_status = 'suspended'` (or they're trying to convert from a restricted state somehow). This shouldn't normally happen since restricted-state users can't sign up at Checkpoint 1 — but defense-in-depth.

**Layout:**
- Centered illustration
- Heading: "We can't move this league to PotKeeper"
- Body:
  > *"Only the league's commissioner can move it to PotKeeper, and PotKeeper isn't available in your state right now. If another league member is in an eligible state, they can take over commissioner role on Sleeper and convert the league themselves."*
- Single button: "Got it"
- Tertiary text link: "Send my league a note" → pre-filled message that explains the situation, can be sent via Sleeper DM

### Screen 3.3 — Invite Existing Members

**Purpose**: Notify the 12 members from the Sleeper league that their commissioner just turned it into a PotKeeper league. Get them to download the app and onboard.

**Layout:**
- Top bar: back + "Invite your league" + step indicator
- Heading: "Time to bring your league over"
- Pre-populated list of 12 members from the source platform:
  - Avatar + Sleeper username + team name
  - Status pill: "Not on PotKeeper yet" / "Already on PotKeeper" (we cross-reference Sleeper usernames against our user table)
- Bulk invite options:
  - "Generate invite link" → big copy button
  - "Send to all" → opens system share to Sleeper league chat / Discord / SMS / email
- Per-member action: "Send DM" if they're already on PotKeeper
- Tertiary: "Skip and invite later"
- Sticky bottom: "Done"

### Screen 3.4 — Suggest PotKeeper (member path)

**Trigger**: Tap "Suggest to [Commish Name]" on an unconverted league card where you're a member.

**Purpose**: Empower members to evangelize their commissioner. This is a viral acquisition loop.

**Layout:**
- Top bar: back + "Suggest PotKeeper"
- Heading: "Send your commissioner an invite"
- Card showing: "[Commish Name] runs [League Name] on Sleeper"
- Pre-filled message preview (editable):
  > "Hey [Commish], I just found PotKeeper. It's like LeagueSafe but it auto-pays winners based on our final standings on Sleeper. Want to use it for our league this season? Here's the link: [link]"
- Send options:
  - Sleeper DM (opens deep link to Sleeper)
  - SMS
  - Email
  - Copy link
- Tertiary text: "We won't spam them — only this one message goes through."
- Sticky bottom: "Send"

### Screen 3.5 — Convert Success

- Confetti animation
- "[League Name] is now on PotKeeper"
- Recap card: pot target, payout breakdown, members invited, members joined so far
- Two CTAs:
  - Primary: "Pay your buy-in →" (jumps to Flow 5)
  - Secondary: "View league" → Flow 6 League Detail
- Tertiary: "Done"

---

## Flow 4: Create a League from Scratch (multi-step)

5-step flow. Use a top progress bar (5 dots) to show position. Used when there's no existing fantasy league to convert from (e.g., a new league forming, or a private league not yet on a platform).

### Screen 4.1 — Step 1: Basics

- Top bar: back + "Create League" + step indicator "1 of 5"
- "Let's start with the basics" heading
- Input: "League name" (e.g., "Last Call Dynasty")
- Sport selector (segmented control): NFL / NBA (disabled, "soon")
- Platform selector (segmented control with logos): Sleeper / ESPN / Yahoo (disabled) / "We'll set this up later"
- If a platform is selected: optional "Pull from existing league on [platform]" picker (this is a shortcut into the conversion flow above)
- Sticky bottom: "Continue" (disabled until name + sport selected)

### Screen 4.2 — Step 2: Buy-in & Members

- "How much and how many?" heading
- Buy-in input (large, currency formatted): "$" with stepper (+/- $5)
- Common presets as chips: $25 / $50 / $100 / $200 / $500
- League size: "How many members?" stepper (4-32, default 12)
- Member-paid platform fee toggle: "Members cover the 2.5% fee" / "I'll cover it" (default: members)
- Live preview card at bottom:
  - "Total pot when everyone pays: $XXX"
  - "Each member pays: $XX (incl. fees)"
  - "After platform fee: $XXX disbursed"

### Screen 4.3 — Step 3: Payout Split

- "How should winnings be split?" heading
- Three preset buttons:
  - "Standard (60/30/10)"
  - "Winner takes all (100)"
  - "Top half (10 spots)"
- "Custom" reveals a sortable list with sliders for each rank
- Live preview: 1st place gets $X, 2nd gets $Y, etc.
- Validator: must total 100%, show error if off

### Screen 4.4 — Step 4: Charity (optional)

- "Want to give back?" heading
- Toggle: "Route part of the pot to charity"
- If on:
  - Charity selector (curated list with logos): Boys & Girls Club, Tunnel to Towers, local options, etc.
  - Search bar to find a 501(c)(3)
  - Slider: "% of pot to charity": 0-25%
  - Or: "Last place pays $X to charity" toggle (the fun-shame option)
  - Preview update: "1st place: $X, ..., Charity: $Y"
- Bottom: "Skip" link if they don't want this

### Screen 4.5 — Step 5: Review & Invite

- "Looks good?" heading
- Full league summary card:
  - Name, sport, platform
  - Buy-in, total pot, payout split breakdown
  - Charity if applicable
- Edit pencil icon next to each section to jump back
- **Sponsorship code field** (collapsed by default, same UX as Screen 3.2):
  - Disclosure row: "Have a sponsorship code?"
  - On expand: monospace input + Apply button
  - On valid code: green callout with boost amount and unlock conditions
  - See `TECH_SPEC.md` §3.11 for validation logic
- "Invite members" section:
  - QR code (big, scannable)
  - Invite link with copy button
  - 6-digit join code
  - "Share via..." button (system share sheet)
- Sticky bottom: "Create League"

### Screen 4.6 — Success: League Created

- Success animation (checkmark, confetti restrained)
- "Your league is live"
- "[League Name]" subheading
- Two action buttons:
  - Primary: "Pay your buy-in →" (jumps to Flow 5)
  - Secondary: "Share invite"
- Below: "Members will appear here as they join"
- Tertiary: "Done"

---

## Flow 5: Pay Buy-in (Stripe Checkout)

### Screen 5.0 — Verify Billing (NEW: Checkpoint 2, first paid action only)

**Trigger**: First time a user attempts to pay any buy-in or join any paid league. This screen is shown **once per account**; subsequent buy-ins skip directly to Screen 5.1.

**Purpose**: Confirm billing address state matches eligibility. Catches the user who declared one state at signup but has billing in a restricted state.

**Layout:**
- Top bar: back + "One quick check"
- Centered illustration (light, friendly)
- Heading: "Verify your billing info"
- Subtitle: "We need to confirm your billing address before you can join paid leagues. This is a one-time check — we won't ask again."
- Stripe SetupIntent embedded form:
  - Card number / Apple Pay / Google Pay (surfaced first)
  - Cardholder name
  - Billing address (pre-filled if Apple/Google Pay used)
- Trust copy below form: *"No charge yet. We'll only verify and save this card for future buy-ins."*
- Primary button: "Verify my info"
- Footer: tiny disclaimer "Powered by Stripe. Your card details are encrypted and never touch our servers."

**Logic (after submit):**
- Stripe returns verified billing details
- Read `payment_method.billing_details.address.state`
- If state ∈ allowed list → save payment method, set `geo_status = 'verified'`, set `setup_intent_completed_at = now()`, advance to Screen 5.1
- If state ∈ restricted list → show Screen 5.0.1 (suspension)

### Screen 5.0.1 — Billing State Mismatch (suspension)

**Layout:**
- Centered illustration (subdued)
- Heading: "We can't verify your account"
- Body:
  > *"Your billing address is in [State], where PotKeeper isn't available. The state you told us at signup ([Declared State]) is different from the one on your card.*
  >
  > *We've placed your account on hold while we sort this out. Please reach out to support if you think this is a mistake."*
- Single button: "Contact support" (mailto link to support@potkeeper.app)
- Tertiary text link: "Sign out"
- Logic: set `geo_status = 'suspended'`, log incident, send ops notification

### Screen 5.1 — Pay Buy-in

**Trigger**: User has completed Screen 5.0 verification (or completed it on a prior buy-in). Now they're paying for an actual league.

**Layout:**
- Top bar: back + "Pay your buy-in"
- League card (compact version showing name, pot, your rank slot)
- Big amount: "$50.00"
- Breakdown card:
  - Buy-in: $50.00
  - Stripe processing fee: $1.75
  - Platform fee at payout: ~$1.25
  - You pay now: **$51.75**
- Saved payment method (from SetupIntent): "Pay with Visa •••• 4242" with edit chevron
- Required checkbox: "I authorize this charge for entry into [League Name]. I understand winnings will be paid out at season end based on final standings."
- Sticky bottom: "Pay $51.75" (button disabled until checkbox checked)

### Screen 5.2 — Stripe Checkout (hosted)

Stripe-hosted, in-app browser. Pre-filled with email and saved payment method. Apple Pay / Google Pay surfaced first. Faster than the SetupIntent flow because card is already saved.

### Screen 5.3 — Receipt / Welcome to League

- Success animation
- "You're in" heading
- Receipt card:
  - Amount paid
  - League name
  - Date
  - Stripe transaction ID (small, copyable)
- Email confirmation: "Receipt sent to [email]"
- Trust badge: "Your buy-in is held in PotKeeper's Stripe escrow until season end"
- Two CTAs:
  - Primary: "Go to league →"
  - Secondary: "Connect bank for payout (so you can collect winnings)" → starts Flow 7

---

## Flow 6: League Detail (during season)

### Screen 6.1 — League Overview

**Purpose**: The main screen members open all season. Tab-based.

**Top section (always visible above tabs):**
- League name + edit/settings gear (commissioner only)
- Bar sponsor banner if applicable: "Sponsored by [Bar Name]" with logo and incentive offer (e.g., "Free first round at draft party" or "$20 bar credit included")
- Stats row: Pot ($), Week (X of Y), Your rank (#X), **Members as a fraction (joined/total) with a colored dot** (green = all members linked, amber = ≥50% linked, red = <50% linked) and an "on PotKeeper" sub-label. The fraction is computed from `league_members` where `linked_profile_id IS NOT NULL OR is_owner = true` over total `league_members`.
- **Commissioner card** below the stats row showing the current commissioner's avatar + name. If the commissioner doesn't have a `linked_profile_id` yet (they haven't joined PotKeeper), an amber "Invite" pill appears next to their name that opens the native Share sheet via the shared `shareLeagueInvite` helper (deep link + nudge copy: "Set up the pot on PotKeeper so we can play for real money this season"). Visible to **everyone in the league**, not just members.
- Quick actions row: "Share invite", "Chat", "Standings"

**Tabs:**
1. **Standings**
2. **Pot**
3. **Members**
4. **Activity**
5. **Rules**

### Tab 6.1.1 — Standings

Pulled from Sleeper/ESPN/Yahoo, refreshed every few hours.

- "Last synced 2 mins ago" pill at top (tap to refresh)
- Ranked list of members (1-12):
  - Avatar
  - Team name + member name
  - Record (W-L)
  - Points for / against
  - Trend arrow (up/down from last week)
  - Trophy icon next to whoever is in a payout slot

### Tab 6.1.2 — Pot

THIS IS THE ICONIC SCREEN. Make it beautiful.

- Hero: huge $ figure of current pot + ticker animation when it changes
- **Sponsorship banner** (only if `league.sponsorship_status` is set):
  - **Pre-funding state** (`sponsorship_status = 'redeemed_pending'`):
    - Banner background: muted green with subtle PotKeeper logo watermark
    - Headline: "Sponsored by PotKeeper"
    - Body: *"+$500 boost unlocks at 80% paid by Sept 8 — currently at 60% (7 of 12 paid)"*
    - **Live projected-boost number**: `min(member_pot_paid * match_ratio, boost_max_cents)`. So a $300 member pot in a 1:1 / $500-cap league reads "+$300 projected boost"; once paid passes $500 it pegs at "+$500". Source data: `get_sponsorship_view` RPC + `league_pot_balance.member_paid_cents` (see `TECH_SPEC.md` §3.13).
    - Inline progress bar showing current % toward the `conditions.min_members_paid_pct` threshold (default 80%, but per-code overridable via the RPC). Denominator mirrors the buy-in UI and `sponsorship-boost-tick` cron — `linked_profile_id IS NOT NULL OR is_owner = true`.
    - Expires-in countdown ("Expires in 4d 3h" → "Expires in 47m") next to the partner name.
    - Tap → bottom sheet explaining how the boost works and link to ToS section.
  - **Funded state** (`sponsorship_status = 'funded'`):
    - Banner background: solid brand green with PotKeeper logo
    - Headline: "Pot includes $500 PotKeeper sponsorship boost"
    - Body: *"Funded [date]. Boost is part of the pot and pays out with standings."* Actual credited amount comes from `league_pot_balance.sponsorship_credited_cents` (not `boost_max_cents`) — important when match-ratio caps kicked in below the maximum.
    - Tap → bottom sheet "How this works"
  - **Forfeited state** (`sponsorship_status = 'forfeited'`):
    - Banner: muted gray, no logo emphasis
    - Headline: "Sponsorship boost forfeited"
    - Body: *"League didn't reach 80% paid by Sept 8. The pot is just member buy-ins."*
    - No tap action
- **"Have a sponsorship code?" hint** (only when `sponsorship_status = 'none'` AND the league is configured for buy-ins):
  - Dashed sky-tinted card below the pot hero.
  - Headline: "Have a sponsorship code?"
  - Body: *"PotKeeper partners can boost your pot. Apply a code and we'll match buy-ins up to the partner's cap."*
  - Tap → routes to the buy-in `SponsorshipSetupSection` (the canonical redemption surface). Visible to commissioner only; members see no card.
  - Same affordance also appears inside `PotUnconfiguredCard` (commissioner pre-buy-in setup) and on the Sleeper-import success step. All three surfaces share the same destination so redemption stays single-source.
- Visual: stacked bar showing what each rank's projected payout is
  - If pre-funding sponsorship: stacked bar shows current pot (solid) + projected boost (dashed/translucent overlay)
- Card: "Where the money goes when season ends"
  - 1st place: $720 → [Member's name]
  - 2nd place: $360 → [Member]
  - 3rd place: $120 → [Member]
  - Charity: $X → [Charity name]
- Card: "Payment status" (commissioner sees all, members see their own)
  - 12 / 12 paid
  - List with checkmarks
- Card: "Pot history" — line chart of pot size over time as members joined
  - If sponsorship funded: vertical marker on the chart at funding date with "+$500 sponsorship boost" annotation
- Trust footer: "Held in PotKeeper Stripe escrow. Transaction ID: [hash]" (link to Stripe receipt)

### Tab 6.1.3 — Members

Simple list:
- Section header reads "Roster · {joined}/{total} on PotKeeper" so the linked vs unlinked count is one tap deeper than the header stat.
- Per row: avatar, name, team name, rank, paid status, "DM" button (if we add chat later).
- Commissioner has a small badge.
- **Per-row Invite affordance**: any member row where `linked_profile_id IS NULL` and `is_owner = false` (i.e. on Sleeper but not on PotKeeper, and not the commissioner — the commish has their own invite button in the header card) renders a compact sky-blue "Invite" pill that opens the native Share sheet via `shareLeagueInvite`. Copy is auto-join framed: "Join our league on PotKeeper. When you sign up and link your Sleeper account, you'll be added automatically." This works because of the `platform_identities_auto_link` trigger in `TECH_SPEC.md` §3.12 — the member just signs up and verifies their Sleeper handle; the trigger does the rest.
- Visible to **everyone in the league** (not gated to commissioners). No bulk "Invite all missing members" button — keep per-row to avoid spam patterns and keep social graph attribution clean.

### Tab 6.1.4 — Activity Feed

Vertically scrolling list of events:
- "[Member] joined and paid"
- "[Member] won Week 5"
- "Pot reached $1,200"
- "[Bar Name] dropped first-round-free at draft party" (if sponsored)
- Each event has timestamp + icon

### Tab 6.1.5 — Rules

Read-only display of the league config:
- Buy-in
- Payout split
- Charity
- Fantasy platform link (deep link to Sleeper/ESPN league)
- "Edit rules" button if commissioner (only available pre-season or with member vote mid-season)

---

## Flow 7: Connect Bank for Payout (Stripe Connect Express)

> **Product principle (deferred KYC):** Stripe requires SSN for any individual receiving payouts (Bank Secrecy Act + IRS 1099-K). Asking for SSN at signup creates serious "is this app sketchy?" friction for a brand new user. So we **never ask for SSN until the user has actual winnings owed to them** — the same playbook DraftKings, FanDuel, Underdog, and PrizePicks all use. The wallet/onboarding route exists, but settings does **not** surface a "Set up payouts" CTA for users who haven't started onboarding. The natural triggers below are the only places the user is prompted to start Flow 7. (Once they've started, settings shows a "Payouts" status row so they can resume / confirm.)

### Screen 7.1 — Trigger

**Triggers (in order of frequency at season end):**
- Banner at top of Home: "Connect a bank to receive payouts" → tap to open *(only shown once payouts become possible — i.e. user is in a paying spot mid-season or season has ended)*
- Push notification 2 weeks before season end: "Heads up: connect a bank to receive your winnings"
- Inline prompt on League Detail Pot tab if you're in a payout slot but haven't connected
- League winnings card on Home: "$340 is waiting for you. Set up payouts to claim."

**Not triggered by:** signup, settings browse, or league join. Day-1 users should never see Flow 7 unless they explicitly seek it out.

### Screen 7.2 — Pre-Stripe Explainer

- Top bar: back + "Connect your bank"
- Trust illustration: a lock + bank icon
- Heading: "Set up your payout method"
- Body: "We use Stripe to send payouts directly to your bank. It takes about 30 seconds."
- Bullets:
  - "Verify your identity (Stripe handles this)"
  - "Add your bank account or debit card"
  - "Get paid automatically when you win"
- Tertiary: "Why do I need this?" → bottom sheet
- Primary button: "Continue with Stripe" → deep link out

### Screen 7.3 — Stripe Express Onboarding

Stripe-hosted flow. Out-of-app web browser. Comes back via deep link to:

### Screen 7.4 — Success: Bank Connected

- Success animation
- "You're all set"
- Card: "Bank ending in •••1234"
- "We'll send your winnings here automatically"
- Primary CTA: "Done" or "Back to league"

---

## Flow 8: End of Season / Payout

### Screen 8.1 — Season Ending Banner

**Trigger**: Sleeper/ESPN reports the league is in final week or status changed to `complete`.

- Top of all screens: dismissible banner with "Season ending — verify standings to start payout" with "Review" CTA

### Screen 8.2 — Standings Authorization (the 48-72hr window)

**Purpose**: League members get a chance to flag disputes before payouts fire. **This is the screenshot you put on Reddit.** It's the single image that explains why PotKeeper is different from LeagueSafe.

- Top bar: "Verify Final Standings"
- Banner: "Authorization window closes in 47:23:11" (countdown)
- Final standings displayed (same component as live standings, but locked)
- Card: "Projected payouts" with each winner and amount
- Action card per member:
  - "Looks right" (tap to authorize)
  - "Something's wrong" → dispute flow
- Progress: "10 of 12 members have authorized"
- Footer text: "When the window closes, payouts will be sent automatically. If a dispute is raised, payouts pause until resolved."

### Screen 8.3 — Payout in Progress

- Hero animation (money flying or progress sweep)
- "Sending payouts..."
- List of recipients with status:
  - "[Member] - $720 - ✅ Sent"
  - "[Member] - $360 - ⏳ Processing"
  - "[Member] - $120 - ⏳ Pending bank connection"
- Charity row separately at bottom
- Note: "Most payouts arrive within 1-2 business days. We hold 5% of the pot for 30 days as chargeback protection, then release it."

### Screen 8.4 — Payout Complete (member who won)

- "The Win" Lottie animation plays full-screen (3.0-4.0s, see `BRAND.md` § Animation & Motion). Animated count-up of the payout amount renders inside the Lottie's transparent center safe area.
- "You won $720"
- League name + your rank
- Card: "Sent to bank ending in •••1234"
- Card: "Receipt" with transaction ID
- **YTD context line** (small, muted, below receipt): "Your year-to-date PotKeeper winnings: $X across N leagues"
  - If this payout puts the user at or over $600 cumulative, append: *"You've reached the 1099-K threshold. Stripe will issue your form by Jan 31."* (tap → Screen 10.3 Tax Center)
- Two CTAs:
  - Primary: "Tell your friends" (share to social with templated copy)
  - Secondary: "View receipt"
- Below: "Your league is over. Want to renew for next season?" with renewal CTA

### Screen 8.5 — Payout Complete (member who didn't win)

- Empty trophy or "Better luck next year" illustration
- "Your season is complete"
- Card showing your final rank, points, record
- Note: "[Winner] won the league with [stat]"
- Renewal CTA: "Run it back next season?"

---

## Flow 9: Browse / Discover

### Screen 9.1 — Browse Leagues

**Purpose**: Find new leagues to join. Location-aware. Shows bar leagues, public leagues, and (Phase 3) creator leagues.

**Layout:**
- Top bar: "Browse" + filter icon (top right)
- Segmented control near top:
  - **Near Me** (default if location enabled)
  - **Bar Leagues**
  - **Public**
  - **Creator** (Phase 3, hidden until launch)
- Below segmented control: filter chip row (sport, buy-in range, league size) — adds to current sub-tab's filter
- Map view toggle (top right of segmented control area): list view ↔ map view

### Screen 9.1.a — Near Me Sub-tab

If location not yet granted, full-screen overlay before list shows:

**Location Permission Pre-prompt:**
- Illustration: a map pin
- Heading: "Find leagues near you"
- Body: "PotKeeper can show bar leagues and public leagues nearby. We only use location for this — never tracked in the background."
- Primary button: "Enable Location" → triggers iOS native permission dialog
- Tertiary: "Search by city instead" → opens text input with popular cities (DC, NYC, ATL, LA, Chicago)

If granted, show:
- Header: "Near [Current City]"
- List grouped by distance:
  - **Bar Leagues** (within 10 miles)
  - **Public Leagues** (any distance, sorted by buy-in)
- Each card shows distance + bar logo (if applicable) + league name + buy-in + members slots remaining + "Join" CTA

### Screen 9.1.b — Bar Leagues Sub-tab

- Header: "Bar-sponsored leagues"
- Toggle: "All cities" / "Near me"
- List of leagues grouped by bar:
  - Bar header card (bar logo, name, "X active leagues") tap → Bar Partner Page (Screen 9.2)
  - 1-3 league cards under each bar
- Empty state if no bars in your area: "No partner bars near [City] yet. Want to bring PotKeeper to your local bar?" + "Suggest a bar" form

### Screen 9.1.c — Public Leagues Sub-tab

- Header: "Public leagues open to join"
- Sort options: Newest / Lowest buy-in / Filling soonest
- League cards with "Join" CTA
- Each card has: league name, sport, platform, buy-in, X/Y members, host avatar, optional creator badge

### Screen 9.2 — Bar Partner Page

- Hero: bar's banner image + logo + name
- Bar info: address, hours, fan club affiliation (e.g., "Official Broncos Backers DC"), distance from you
- Section: "What you get": bar's chosen incentive (e.g., "Free first drink at draft party" / "$20 bar credit per member" / "Free draft party hospitality")
- Section: "Active leagues at [Bar Name]" — list with Join CTAs
- Section: "Events": "Draft party 8/24 at 7pm, payout night 1/12"
- Map showing bar location
- Sticky bottom: "Join a league here →"

### Screen 9.3 — Map View

- Full-screen map with pins for bars + public leagues nearby
- Tapping a pin opens a bottom sheet with bar/league summary + "Join" or "View Bar" CTA
- Floating filter chip + "List view" toggle
- Search bar at top: "Search by team, bar, city, league name"

---

## Flow 10: Profile + Activity

### Screen 10.1 — Profile

**Purpose**: Settings, identity, transaction history, support.

**Layout:**
- Top: avatar (tap to edit), display name, member since date
- Stats row: leagues won, lifetime winnings, lifetime buy-ins
- **YTD card** (new): "Year-to-date winnings: $X" with a sub-pill below the amount
  - If `ytd_winnings_cents < 60000`: gray pill *"Below $600 1099-K threshold"*
  - If `ytd_winnings_cents >= 60000`: gold pill *"1099-K threshold reached — Stripe will issue your form by Jan 31"*
  - Tap the card → Screen 10.3 Tax Center
- Sections (each as a tappable row that pushes a new screen):
  - **Account**: email, change password, delete account
  - **Connected fantasy accounts**: Sleeper username (with reconnect), ESPN status (with re-auth button if expired), Yahoo (Phase 2)
  - **Payout method**: Stripe Connect status, bank ending in •••, "Update bank"
  - **Activity** (replaces Wallet tab): all transaction history → Screen 10.2
  - **Tax Center** (new): YTD winnings, 1099-K status, FAQ → Screen 10.3
  - **Notifications**: toggles per type (push, email)
  - **Privacy**: location, data sharing
  - **Help & Support**: FAQ, contact, report a league
  - **Terms & Privacy Policy**
  - **Sign out** (red, bottom)

### Screen 10.2 — Activity / Transaction History

**Purpose**: All the wallet/transaction stuff that previously had its own tab. Lives under Profile because money context is on each league anyway.

**Layout:**
- Top bar: back + "Activity"
- Top: total balance card showing $ across all active leagues
- Filter chips at top: All / Buy-ins / Payouts / Refunds
- Vertically scrolling list of transactions:
  - Each row: icon (color-coded by type) + counterparty (league name) + date + amount (signed)
  - Tap a row → expanded receipt view with Stripe transaction ID, payment method, status, "Download PDF receipt" button
- Empty state: "No activity yet. Once you pay into a league, it shows up here."

### Screen 10.3 — Tax Center (NEW)

**Purpose**: Make 1099-K issuance predictable, not surprising. Users should know their tax situation before tax season hits, not after they get an email from Stripe in January.

**Why a dedicated screen**: First-time fantasy winners who get a 1099-K without warning rate the experience badly enough to churn. Surfacing YTD winnings + threshold proximity year-round is the best mitigation. See `TECH_SPEC.md` §10 Tax Reporting for the data and policy.

**Layout:**
- Top bar: back + "Tax Center"
- **Hero card**: YTD winnings, big tabular number "$X" with subtitle "across N leagues this year"
- **Threshold progress bar**: visual showing $0 → $600 → over with current position
  - Below $600: progress bar in muted green, label *"$Y to go before a 1099-K is issued"*
  - At or above $600: progress bar full, gold pill *"1099-K will be issued by Stripe (Jan 31)"*
- **Status card** (state-dependent):
  - If under $600: *"Stripe will only issue a 1099-K if your gross PotKeeper winnings hit $600 in this calendar year. You're not there yet — but reporting income is your responsibility regardless of whether you receive a form."*
  - If at or above $600 and current year: *"Stripe will issue your 1099-K by January 31, 2027. You'll get an email and can download it anytime in your Stripe Express dashboard."*
  - If 1099-K already issued: green checkmark *"Your 2026 1099-K is available in your Stripe Express dashboard."* + primary button "Open Stripe Express"
- **FAQ section** (collapsible items, deep links to `potkeeper.app/tax`):
  - "Will I receive a 1099-K?"
  - "Do I have to report winnings if I didn't get a 1099-K?"
  - "My state has a different threshold. What now?"
  - "I see fees on my receipt. Are those deductible?"
  - "I won and lost across leagues. Net or gross?"
  - "Where do I get my 1099-K?"
- **Disclaimer footer**: *"This isn't tax advice. Talk to a CPA for your specific situation. PotKeeper doesn't issue tax forms — Stripe does."*

**Logic / data:**
- YTD winnings calculated server-side via Edge Function `get-tax-summary` (sums `payouts.amount_cents` where `recipient_id = user`, `status = 'paid'`, `created_at >= year-start`)
- Threshold logic: federal $600. State-specific overrides (CA, MA, VA, NJ have lower floors regardless of federal phase-in) handled by Stripe; we display the federal threshold and rely on Stripe for state-specific issuance.
- Stripe Express deep link uses the user's `stripe_connect_account_id` to auth-deep-link to their Express dashboard. If the user hasn't completed Connect onboarding yet, the button reads "Connect bank to access Stripe Express" and routes to Flow 7.

**Empty state** (user with no payouts yet):
- Illustration: friendly receipt icon
- Heading: "Nothing to report yet"
- Body: "Once you win a payout, your year-to-date earnings and 1099-K status will show up here."
- Single tertiary link: "Read about how taxes work for fantasy winnings" → `potkeeper.app/tax`

---

## Push Notifications (copy spec)

Implement these triggers and corresponding copy:

| Event | Title | Body |
|---|---|---|
| Member joined your league | "[Member] joined [League]" | "Welcome them in the chat" |
| Member paid buy-in | "[Member] paid up" | "Pot is now $X" |
| You won a week | "You won Week X" | "[+points] vs [opponent]" |
| Buy-in reminder | "Don't get left out" | "Pay your $X buy-in for [League] before kickoff" |
| Connect bank reminder | "Set up your payout method" | "Season ends in 2 weeks. Connect a bank to get paid." |
| Standings authorization needed | "Verify final standings" | "[League] season is complete. Tap to review." |
| Payout sent | "You won $X 🏆" | "Sent to your bank, arrives in 1-2 days" |
| Bar event | "[Bar] is hosting your draft party" | "8/24 at 7pm. RSVP →" |
| Member suggested PotKeeper to you | "[Member] thinks your league should use PotKeeper" | "Tap to set it up for [League]" |
| Sleeper league converted by member-suggestion follow-up | "[Commish] enabled PotKeeper for [League]" | "Time to pay your $X buy-in" |
| Sponsorship boost unlocked (members hit 80% paid threshold) | "Pot just got bigger" | "PotKeeper added $X to your league pot. Total pot: $Y." |
| Sponsorship code redeemed by commissioner (members notified at league start) | "[League] is sponsored by PotKeeper" | "Pay your buy-in to unlock a $X bonus to the pot. 80% of members need to pay by Sept 8." |
| YTD winnings approaching 1099-K threshold ($500+ cumulative) | "Heads up about taxes" | "You've won $X this year. At $600, Stripe issues a 1099-K. Tap for what that means." |
| First payout that crosses $600 cumulative | "1099-K threshold reached" | "Stripe will issue your 1099-K by Jan 31. We'll remind you in January." |
| 1099-K available (sent in January) | "Your 1099-K is ready" | "Stripe issued your 2026 form. View it in your Stripe Express dashboard." |

(Avoid emojis except for the trophy on payout — we earn that one.)

---

## Universal States

Every dynamic screen needs:

- **Loading**: skeleton placeholders that mirror final layout
- **Empty**: illustration + helpful copy + primary action
- **Error**: friendly copy + retry button + "Contact support" link
- **Offline**: "You're offline" toast + cached data when possible
- **Refresh**: pull-to-refresh on all list screens

---

## Phase 3 Screens (sketches only, build later)

### Creator Dashboard
- Multi-league overview
- Aggregate stats across leagues
- "Invite my audience" link with referral tracking
- Hosted leaderboard for creator's branded league

### Pro Commissioner Dashboard
- All leagues at a glance
- Bulk-invite tools
- Custom payout rule builder
- Member analytics (who pays late, engagement scores)

### Charity Routing Detail
- Per-league charity selection with vetted partners
- Year-end donation summary for tax purposes

### Creator Sub-tab in Browse
- Leagues hosted by content creators (TubFrog, etc.)
- Sortable by creator, audience size, league size

---

## Notes for the Designer / AI Mocking Tool

When generating mocks:

1. **Lead with these 6 hero screens** — they sell the product:
   - Home with leagues (Screen 2.2)
   - Leagues tab "From Sleeper" sub-tab with "+ Add PotKeeper" CTAs (Screen 3.1.c) — *the killer onboarding visual*
   - Convert Existing League pre-fill summary (Screen 3.2) — *the 60-second league setup*
   - Pot tab during season (Tab 6.1.2)
   - Standings authorization with countdown (Screen 8.2) — *the screenshot for Reddit*
   - Payout complete - won (Screen 8.4)

2. **Make the trust signals concrete.** Every screen that touches money should subtly remind the user: "held in escrow," "verified by Stripe," "PotKeeper never has access to your bank login."

3. **Numbers should always be tabular and prominent.** Money is the product. Don't bury it.

4. **Don't gambling-ify.** No flashing colors, no slot-machine animations, no neon. This is closer to Robinhood / Apple Cash than DraftKings.

5. **Empty states matter as much as filled states.** A new user sees empty states first.

6. **The Unconverted League Card visual must be distinct from the PotKeeper League Card.** Dashed border or lighter weight, so users intuit "this is my Sleeper league we're showing you, we haven't done anything to it yet." Trust signal.

7. **Mobile-first, single column.** Web later, but design for iPhone 15 Pro / Pixel 8 dimensions first.

---

*Last updated: May 1, 2026 (Session 9 — Sleeper-link state machine, league header invite affordances, Pot tab projected-boost UI). Pair with `VISION.md` for the why.*
