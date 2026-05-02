# PotKeeper

> The fantasy commissioner never holds the money.

---

## TL;DR

Fantasy football money leagues run on Venmo and trust. When the trust breaks, the money disappears. PotKeeper replaces the trust dependency with a Stripe-backed escrow that auto-pays winners based on real standings pulled from Sleeper, ESPN, and Yahoo. LeagueSafe holds funds, but still makes the commissioner manually disburse them. We hold funds and pay out automatically. That difference is the entire product.

---

## The Problem (the Matt Miller incident)

In Spring 2025 I joined a Sleeper dynasty league run by Matt Miller, an NFL insider with hundreds of thousands of followers. 12 people paid into a $250 first-place pot. Season ended. No payout.

The chat that followed reads like a product brief:

- Member: "for next year's league we should use one of those apps that automatically sends purse to winners"
- Member: "leaguesafe still has you manually have to be sending winnings tho"
- Member: "there was one that handled donations and sending out of purse to winners as well. i need to find it"

The "I got hacked" excuse, true or not, exposed the failure mode every paid league quietly tolerates: **a single person controls everyone's money and the system has no way to route around them.**

Most paid leagues don't even have LeagueSafe. They run on a commissioner collecting Venmo or Cash App, holding the cash in their personal bank account, and paying out by hand. Every league has a story. Money goes missing. Commissioners get hacked. Drafts get rigged. Friendships break.

## The Solution

PotKeeper is a mobile app where:

1. Commissioners create a league pot, set buy-in, payout split, and (optionally) charity routing
2. Members pay via Stripe Checkout. Funds land in PotKeeper's platform Stripe balance, never the commissioner's personal account
3. We sync with the league on Sleeper, ESPN, or Yahoo to track standings
4. When the season ends, the league standings authorize a final payout window (48-72 hours)
5. We auto-disburse to each winner's verified Stripe Connect account based on the rules they agreed to up front

The commissioner never touches the cash. The members get paid even if the commissioner ghosts, dies, gets hacked, or just forgets.

## Why Now (and not in 2024 when I shelved this)

Three things shifted in our favor:

- **Sleeper became the dominant fantasy platform**, and its API is free, public, no-auth REST. Final standings is one HTTPS GET away. ESPN was the bottleneck before; Sleeper is a gift.
- **Stripe Connect Express matured** to where you can punt the entire money-transmitter licensing burden to Stripe and focus on product. Express + Identity handles KYC for payout recipients in ~30 seconds.
- **Demand is loud and unmet.** The exact users we need are publicly posting "I wish this existed" in chats and forums right now. The Matt Miller story isn't unique, it's the default.

## Product Principles

1. **The commissioner is never a single point of failure.** Anything that requires "the commissioner agreed to do X" must have a fallback.
2. **Money inside is always reconciled.** Every dollar has a ledger entry tying it to a specific league, a specific member, a specific event.
3. **Pull standings from the source of truth, not self-report.** Members can't argue with what their fantasy app says.
4. **Pay out fast, transparently, and on a schedule the league agreed to.**
5. **Never run our own banking.** Money lives in Stripe. We are software.

## ICP

### Primary (Phase 1 launch focus)

**The Reluctant Commissioner.** Someone who got drafted into running a money league, manages 1-3 of them, and hates the collection and payout work. Not a fantasy diehard, just the responsible one. Pays for the relief. Estimated US population: 1-3M.

**The Power Commissioner.** Manages 5+ money leagues, often a fantasy content creator or dynasty nerd, brings audience and entire leagues with them. Estimated US population: ~50K. Each one converts 5-20 leagues. Highest leverage per acquired user.

### Secondary (Phase 2)

- **The Burned Member.** Already lost money to a flaky commissioner. Self-selecting, lowest CAC. Reach via Reddit and X.
- **The Office League.** 8-12 person company leagues with $25-50 buy-ins. Easy B2B2C wedge.
- **The High-Stakes Dynasty League.** $300-1000 buy-ins, multi-year. Highest LTV. Already on LeagueSafe, harder to switch.

## How the Money Flows

```
Member pays buy-in
   ↓ Stripe Checkout
   ↓
Platform Stripe balance (tagged: league_id, member_id)
   ↓ recorded in pot_ledger table
   ↓
... season runs, standings tracked via Sleeper/ESPN/Yahoo ...
   ↓
Season status = "complete" detected
   ↓
48-72hr league authorization window
   ↓
Payout engine reads winners_bracket
   ↓ Stripe transfers to each winner's Connect Express account
   ↓ optional Stripe transfer to charity Connect account
   ↓
95% of pot disbursed immediately
5% held back 30 days for chargeback protection
```

Platform fee is taken at payout time as `application_fee_amount` on the transfer.

## Monetization

### Revenue model

Primary: **2.5% platform fee on the pot, taken at payout.**
Stripe payment processing (~2.9% + $0.30) is passed to the buyer at buy-in.

### Per-league unit economics ($1,200 pot example)

| Line | $ |
|---|---|
| Pot collected | $1,200 |
| Stripe processing fees | -$38 |
| Net to disburse | $1,162 |
| Platform fee (2.5%) | -$30 |
| Net to winners | $1,132 |
| **Platform revenue per league per season** | **$30** |

### Scale projections

| Leagues | GMV | Platform fees | Float yield (~4%, 4mo) | Total ARR |
|---|---|---|---|---|
| 1,000 | $1.2M | $30K | $13-16K | ~$45K |
| 10,000 | $12M | $300K | $130-160K | ~$450K |
| 100,000 | $120M | $3M | $1.3-1.6M | ~$4.5M |

100,000 leagues = 1-2% of the US paid-league market. Achievable in 5 years.

### Layered revenue streams

- **Premium commissioner tier** ($20-30/yr, Phase 3+): multi-league dashboard, custom payout rules, dynasty tracking, analytics. ~10% conversion at scale = meaningful add-on.
- **Sponsored leagues / bar partnerships** (Phase 2): $300-500/season per sponsor for premium placement and multiple branded leagues. Free during v1 launch (see GTM below).
- **Charity routing fee**: 1% of donated funds, marketed as "covers our costs of routing it." Small but story-rich.
- **Float yield**: interest on cash held in Stripe balance during season. Regulatory ambiguity, may need to give back to leagues. TBD.
- **Pricing vs LeagueSafe**: They charge ~$36 commissioner plan + $3-5 per withdrawal = effective ~$66 per $1,200 league. We charge $30. We're cheaper AND we automate payout.

## Go-to-Market

### Phase 0: Friends & Family Cohort (Weeks 1-8 dev, launch Aug 2026 ahead of NFL season)

- Run my own 3 leagues through PotKeeper
- Pitch to Matt Miller's league (Last Call Dynasty) for next season — they wrote our launch material for us
- Goal: 5 leagues, ~60 members, $5K GMV. Every bug found, every UX rough edge sanded.

### Phase 0.5: Fantasy Football Expo (July 24-26, 2026, Canton OH) — Public Launch Event

The single highest-density gathering of our exact ICP all year, landing **6 weeks before NFL kickoff**. Perfect launch runway.

**Investment**: VIP Exhibition Booth at $950 ([thefantasyfootballexpo.com/product/vip-exhibition-booth](https://thefantasyfootballexpo.com/product/vip-exhibition-booth/))

**What the booth includes** (effective net cost ~$625 after subtracting included passes):
- 30-minute YouTube interview on the official Expo channel — long-tail content asset
- Promotional insert in attendee swag bag (every attendee touches our brand)
- Logo on the official Expo t-shirt — every attendee wears PotKeeper for 3 days
- Logo + link on Expo website
- 3 VIP Weekend passes ($225 value) — bring 2 friends/co-founders
- 5 free admission passes for giveaways
- 8x6 booth space near the front entrance

**Attendance**: 600-800 fans, businesses, and influencers. The Expo's track record explicitly markets to "up and coming brands hard launching into the industry" — we are the textbook target customer.

**The signature stunt — corrected for July timing and PotKeeper's product scope**

The original idea (live fantasy league with prop-bet scoring across the weekend) had three fatal problems: NFL preseason doesn't start until Aug 8 (no live games to score), prop bets are gambling-coded which violates our brand, and most fantasy platforms cap leagues at 12 (Sleeper goes to 32, but live drafts of strangers feel forced).

The corrected play uses what's already happening at the Expo:

1. **Sponsor the Expo Cornhole Tournament** (separate package, contact `marketing@thefantasyfootballexpo.com` to inquire about pricing — likely $500-1500). Cornhole is skill-based, fits our compliance posture cleanly, and is photogenic.
   - Entrants buy in via PotKeeper app on-site, $20-50 each
   - Pot held in PotKeeper escrow live, visible on a TV at the booth
   - 1st/2nd/3rd auto-paid via Stripe Connect at the closing ceremony **on Sunday**
   - **Live payout video**: winner's phone buzzes with the Stripe transfer notification on stage in front of the crowd. This is the launch trailer footage.

2. **Sponsor a league drafted at Draft Night Out (Friday)**. The Expo runs live drafts that become real season-long leagues. Sponsor 1-2 of these:
   - Buy-in collected through PotKeeper at the draft
   - Pot held all season
   - Final payout in Feb 2027
   - Capture content of the draft now, follow up with the same group monthly during the season, capture a second story arc moment at season end
   - Six-month documentary that becomes a launch case study

3. **PotKeeper After-Party at a Canton sports bar (Saturday night)** — the bar partnership pilot in action.
   - Reach out to 3-5 Canton bars 6 weeks ahead. Pitch: "We're a sponsor at FF Expo bringing 50-100 fantasy attendees to your area. We'll cover the first 2 hours of bar tab in exchange for using your venue, signage at the door, and you posting about us before/during the event."
   - Proves the bar partnership model in a market we don't even live in — if this works in Canton, it works in DC and NYC
   - Capture content of the after-party for marketing

**Pre-event runway**:

| Weeks out | Action |
|---|---|
| 12 (now, end of April) | Buy the Exhibition Booth at $950. Book Canton hotel before they fill up. Build a list of 50 target creators with handles. |
| 8 (early June) | Working app in TestFlight, ready for live demos. Final logo + swag designed. 4 audience-specific one-pagers. Pitch 3-5 fantasy podcasts the Matt Miller story for interviews recorded live at the Expo. |
| 4-6 (mid June - early July) | DM all 50 creators with personalized notes. Lock 10-15 informal meetings. Order swag (4-week lead time). Outreach to Canton bars for the after-party. Inquire about Cornhole Tournament sponsorship. |
| 2 (mid July) | Practice 60-second + 3-minute demos. Pre-load test-data leagues so demos feel real. Confirm all creator meetings 48hr before. |

**Total spend (booth + ancillary)**:

| Line | Cost |
|---|---|
| VIP Exhibition Booth | $950 |
| Cornhole Tournament sponsorship + prize-pot seed | $500-1,500 |
| Sponsored Draft Night Out league prize pool seed | $0-500 |
| Booth design + signage + iPad mounts | $200-300 |
| Travel + hotel (3 nights) | $500-700 |
| PotKeeper After-Party (open tab, 2hrs) | $500-1,000 |
| Swag (250 koozies + 100 hats + flyers) | $400-600 |
| Custom one-pagers (4 audiences) | $50-100 |
| **Total** | **$3,100-5,650** |

**ROI math (conservative)**:
- 3-5 creator partnerships initiated; 1-2 close → 50-200 leagues each over Year 1
- 50-100 power-commissioner signups → 600-1,200 members across their leagues
- 2-3 fantasy podcast interviews dropping pre-NFL-season → 5-50K listeners each
- Sunday cornhole payout ceremony video → permanent launch trailer footage
- 1 Canton bar partnership proven → template for DC/NYC/ATL replication
- Reddit/podcast press hooks for Phase 1

If even half lands, the spend returns 50-100x in Year 1 GMV.

**The non-negotiable rule**: do not pitch features at the Expo. Pitch the Matt Miller story, hand them the demo, let them ask questions. Story is the hook, product is the proof.

### Phase 0.75: Sponsored Fan-Group Leagues (Aug 1 - Sept 8, 2026)

A targeted, capital-efficient acquisition channel that lights up exactly when fantasy drafts are forming. PotKeeper sponsors 5 lighthouse leagues across NFL fan-group communities (Facebook, Reddit, Discord) by **matching member buy-ins 1:1, capped at $500 per league**. Members put real money in, we double the pot, all winnings go to members (no platform fee for v1 sponsored leagues).

**Why this channel**

- **Trust transfer through admins.** A cold ad is ignored; "our group's admin organized a sponsored league" gets joined.
- **Geographic concentration handles eligibility for free.** Falcons fan groups are 70%+ Georgians, Broncos groups are mostly Coloradans. Targeting eligible-state team groups largely sidesteps the cross-state-league constraint.
- **The product itself eliminates the obvious risk.** Standard concern: "what if the admin pockets the cash?" They can't — PotKeeper pays winners directly to verified Stripe Connect accounts based on Sleeper standings. The whole product premise is the answer to that risk.
- **Built-in content cycle.** Sponsored league sign-up, mid-season standings screenshots, and January payout videos generate three free promotion moments per league.

**Match structure (locked)**

We add $1 for every $1 members put in, capped at $500 boost per league. $25 minimum per-member buy-in to prevent gaming.

| League | Member pot | Our boost | Total pot | Our exposure |
|---|---|---|---|---|
| 4 members × $50 | $200 | $200 | $400 | $200 |
| 8 members × $50 | $400 | $400 | $800 | $400 |
| 10 members × $50 | $500 | $500 (cap) | $1,000 | $500 |
| 12 members × $100 | $1,200 | $500 (cap) | $1,700 | $500 |

**v1 cap: 5 sponsored leagues, max $500 boost each = $2,500 worst case.**

**Distribution mechanic — sponsorship codes**

We issue a unique code per partner (e.g., `PKBOOST-FALCONS-2026`). Admin enters the code during league setup. The boost is **conditional on the league actually running**:

1. 80% of members paid in by Sept 8, 2026 (NFL kickoff)
2. Minimum $25/member buy-in
3. League uses PotKeeper auto-payout (not manual override)
4. One league per partner / fan group

If conditions met by Sept 8: boost credited to pot via `pot_ledger` row of type `sponsorship_credit`. If not met: code forfeits, no boost, partner notified. See `TECH_SPEC.md` §3.11 for the schema.

**During-season UX**

Pre-funding (boost not yet unlocked):
> *Current pot: $400 / Sponsored by PotKeeper, +$500 unlocks at 80% paid by Sept 8 / Projected pot: $900*

Post-funding (boost in pot):
> *Current pot: $900 (includes $500 PotKeeper sponsorship boost)*

The visible countdown creates social pressure to pay so the boost unlocks. Once unlocked, attribution is permanent in the Pot tab.

**Target list (eligible states only)**

Skip groups for teams in WA, ID, HI, MT, NV, parts of LA. Strong v1 targets:

- Broncos (CO), Falcons (GA), Cowboys (TX), Bills (NY/PA), Eagles (PA), Commanders (DC/VA/MD), Bears (IL), Steelers (PA), Chiefs (MO/KS), Patriots (MA)

**Admin pitch (template)**

> *"Hey [Admin]. I built PotKeeper, a fantasy app that auto-pays winners based on Sleeper standings. I'm sponsoring 5 NFL fan-group leagues for the 2026 season. Here's the offer: I'll match every dollar your members put in, up to $500. So if your league has 10 members at $50 each, you play for a $1,000 pot instead of $500. No fees this season — all winnings go to members.*
>
> *I'd give you a sponsorship code (`PKBOOST-FALCONS-2026`) to apply when you set up the league. The boost unlocks once 80% of your members have paid in. All I ask is whoever wins posts a screenshot when payouts hit in January."*

**Spend cap and kill switch**

| Spend | Leagues | Users | CAC | Worth doing? |
|---|---|---|---|---|
| $2,500 | 5 leagues × $500 max | 40-60 | $42-63 | v1 commit |
| $5,000 | 10 leagues | 80-120 | $42-63 | Year 2 if Year 1 retention >60% |
| $7,500 | 15 leagues | 120-180 | $42-63 | Year 2 stretch goal |

**Hard rule: this is a one-season match for v1 launch leagues only.** If sponsored leagues renew next season, they pay full buy-in like everyone else. If we keep matching forever, we're a marketing budget, not a product.

**Kill switch / revisit trigger**: if Year 2 renewal of sponsored leagues is below 40%, the channel doesn't compound — kill it and reallocate to creator partnerships. If 60%+, scale to 15 leagues for 2027 NFL season.

**Risks and how the design handles them**

| Risk | Mitigation |
|---|---|
| Admin sets up fake league to extract boost | Boost is conditional on 80% members paid + $25 minimum per member. Fake leagues fail Stripe KYC at member level, can't reach the 80% gate. |
| Admin pockets the boost | Structurally impossible. Boost is a `pot_ledger` credit, not a transfer to admin. Pays out to standings winners, not admin. |
| Boost-funded league abandons mid-season | If standings never reach `is_final = true`, no payout fires. Funds remain in escrow. Admin notified, members notified, manual ops review. |
| Two admins claim the same fan group | One code per partner, code includes partner identifier. Issuance is human-gated via ops dashboard. |
| Trademark concerns using NFL team names in code (e.g., `PKBOOST-FALCONS-2026`) | Internal-only code identifier; never displayed publicly with team logo. If counsel flags, switch to neutral codes (`PKBOOST-A1`, `PKBOOST-A2`, etc.). |

**Timing constraint**

This tactic has a 5-week execution window: Aug 1 - Sept 8, 2026. Outside that window no one is forming new fantasy leagues. Pre-work (target list, draft DM template, code-issuance flow) must be done by mid-July 2026 alongside the App Store submission push.

### Phase 1: Reddit + X launch (Weeks 8-16, NFL season opener)

- The Matt Miller story IS the launch post. Personal account, r/fantasyfootball + r/dynastyff. "Here's what happened, here's what I built, here's how to use it for your league."
- Twitter/X: target Power Commissioners with audience. Free "PotKeeper Pro" comp for one season in exchange for a mention.
- SEO content seeded for "leaguesafe alternative", "how to run a fantasy money league", "fantasy commissioner got hacked"
- Target: 100 leagues by mid-October.

### Phase 2: Bar Sponsorships

The bar play is real, but staged in two parts.

**Why bars matter:**
- Average sports bar does $500K-$2M/yr revenue, with 20-30% concentrated in NFL Sundays
- A single 12-person money league meeting at the bar 10 weekends × $50/person = $6K incremental revenue per league per season
- NFL Backers Bars (the official gathering spot for out-of-market fans of a team) already have captive fan club communities, mailing lists, and Sunday traffic — these are warmer leads than generic sports bars

**v1 (free, value swap only — launch through end of first NFL season):**

No money changes hands. The deal is straightforward:

| Party | Gives | Gets |
|---|---|---|
| **Bar** | Promotes the league to their fan club + picks an incentive level (or none) + hosts draft party | Foot traffic + brand presence in app + community building |
| **PotKeeper** | Co-brands the league with the bar's name + features them in app | Distribution to pre-formed fan club + social proof |
| **Members** | Buy-in like a normal league | Whatever incentive the bar offers + a community to watch games with + auto-payout |

**Flexible incentive levels (bar picks one):**

| Bar offer | Face value (12-person) | Bar's actual cost (~30% COGS) | Best for |
|---|---|---|---|
| Nothing (just branding) | $0 | $0 | Bars testing the concept |
| First drink free at draft party | ~$80 | ~$24 | Single-event hospitality |
| $10 in-bar credit per member | $120 | ~$36 | Mid-tier bars |
| $20 in-bar credit per member | $240 | ~$72 | Premium bars wanting to differentiate |
| Free draft party hospitality (wings/chips for the table) | ~$50 | ~$15 | Low-effort, high-perception |
| Bar gear giveaway for the winner | ~$30 | ~$10 | Trophy moment lives at the bar |

We display whatever the bar offers on the league page. No prescriptive ask.

**v2 (paid sponsorship tiers — Phase 2, post-traction):**

After the first season proves out the model with foot traffic data, we open paid tiers for bars that want premium placement:

| Tier | Price | What bar gets |
|---|---|---|
| **Watch Party** (default) | Free | Listed in app as "[Team] watch party at [Bar]." Featured on game days. |
| **Sponsored League** | $300/season | Co-branded league with logo on league page + featured slot in Browse tab + "official partner" badge |
| **Bar Network** | $1,500/season | All of the above + intra-bar tournament + custom merch + priority placement |

**What we get from paid tiers:**
- Sponsorship $$ ($300-500/season per bar)
- Anchor partner status used in marketing
- Multi-league commitment (some bars sponsor 3-5 leagues)

Tactic: pick 2-3 bars in DC area first (where I am, where my leagues are). NFL Backers Bars are the warmest targets (Bills Backers, Broncos Country, etc). Multi-city expansion (DC → NYC → ATL → Athens GA → Baton Rouge) over summer 2026. Run a "PotKeeper Bar Cup" inter-bar tournament if it sticks.

### Phase 3: Fantasy Creator Network (year 2)

- Build a creator program: podcasters, dynasty content guys, fantasy YouTubers each get a "[Creator]'s Money League" with their own payout split
- Revenue share with creators (5-10% of platform fee on their leagues)
- This is how Sleeper itself grew — fantasy content creators are the kingmakers

## Roadmap (12 months)

### Q3 2026 (now → August): Build
- Audit and harden existing `money-league-rnr` codebase
- Sleeper integration (primary)
- ESPN cookie storage cleanup, re-auth flow
- Stripe Connect Express integration
- Pot ledger schema + reconciliation
- Buy-in flow with consent receipts
- Payout engine (manual trigger first, scheduled second)
- App Store submission Aug 1 (45 days = approval target by mid-Sep)

### Q4 2026 (Sep-Dec): NFL Season Pilot
- Launch with 5 friends-and-family leagues
- Reddit / X launch in October once buy-in cycle is healthy
- Week 17-18: handle first real season-end payout cycle
- Target: 100 leagues, $50-100K GMV

### Q1 2027 (Jan-Mar): Iterate + NBA / Yahoo
- Postmortem on first season payouts
- NBA fantasy support
- Yahoo OAuth integration
- Premium commissioner tier
- Bar partnership pilot in DC

### Q2 2027 (Apr-Jun): Pre-Draft Push
- Draft kit features (drafted ↔ paid up reconciliation)
- Multi-league dashboard
- Creator program launch
- Target: 1,000 leagues by August 2027

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Stripe rejects Connect platform application | Medium | Submit Day 1, structure as skill-based contest, prepare ToS, expect 1-2 rounds of back-and-forth |
| Apple App Store rejects under 5.3 | Medium-High | Plan web-first launch, structure submission with all required disclosures, have privacy/age-verification copy ready |
| LeagueSafe responds with auto-payout feature | Low-Medium | Their incumbency cuts both ways. They have inertia. We have speed and the better story. |
| Chargeback rate exceeds expectations | Medium | 95/5 holdback, consent receipts, league-vote authorization, 2.5% fee absorbs 0.5% expected loss |
| Fantasy platform breaks our integration | Medium for ESPN, low for Sleeper, low for Yahoo | Multi-platform architecture + manual mode as a first-class feature (see Platform Strategy below). Even if every API dies, the product works. |
| Fantasy platform builds this as a feature | Low | Sleeper has had Sleeper Wallet for years and not iterated. ESPN has no money product. Cross-platform is our moat (no platform will integrate competitors). Compliance lift (Stripe Connect, KYC, money transmitter exposure) is a 6-12 month effort they won't prioritize. |
| Fantasy platform actively shuts us out | Low | We don't use their trademarks, we increase their retention, we BD them early. Worst case we lose one integration and lean on the other two + manual mode. |
| Regulatory pushback in a problem state | Medium | Geo-block at signup using Stripe address validation, refuse leagues with members in WA/MT/ID/AZ/AL/HI |
| Friendly fraud / scam leagues use us as a vehicle | Low-Medium | KYC at payout via Stripe Identity, behavioral signals, reserve hold, "report a league" flow |
| Apple delays kill 2026 NFL season launch | Medium | Web fallback ready, web-only beta is acceptable v1 |

## Platform Strategy (the "what if Sleeper cuts us off" answer)

We sit *above* the fantasy platforms, not on top of one. That is the entire defensibility argument.

### How each platform sees us

| Platform | Has its own money product? | API posture | Likely posture toward PotKeeper |
|---|---|---|---|
| **Sleeper** | Yes (Sleeper Wallet — stagnant for years, manual payout, Sleeper-only) | Public, free, no-auth, deliberately open ecosystem | Indifferent → mildly positive. PotKeeper users need Sleeper data to keep working perfectly to get paid out. We make Sleeper *more* sticky. |
| **ESPN** | No (Disney-owned, real-money-allergic) | Unofficial, cookie-based, periodically changes | Indifferent. We are below their executive attention threshold. |
| **Yahoo** | No | Official OAuth, well-documented, slow-moving | Indifferent → welcoming. Yahoo Fantasy is in decline and needs developer love. |

None of these companies will allocate engineering to shutting us down. Our risk is not "Sleeper retaliates." Our risk is "Sleeper changes API terms incidentally and we adapt in 1-2 weeks."

### Three moats they can't easily clone

1. **Cross-platform.** No fantasy platform will ever support its competitors. We will. Power commissioners running leagues on multiple platforms have one financial home — us.
2. **Compliance + payment rails.** Stripe Connect platform approval, KYC infrastructure, geo-restriction, chargeback handling, ledger + reconciliation = 6-12 months of work for any platform that wants to copy us. None of them have prioritized it in 5+ years.
3. **Distribution + community.** Bars, expo presence, creator partnerships, the Matt Miller story. Compounds over time, not cloneable by code.

### Manual mode as a first-class feature

Architectural commitment from Day 1: a league can be created in PotKeeper with **zero platform connection**. Commissioner manually inputs final standings (with member-vote confirmation = consensus mechanism). The pot ledger, Stripe Connect, payout engine, all work identically.

This is not a fallback — it is a first-class mode. Some leagues legitimately don't have a connected platform (board-game leagues, golf leagues, custom rules leagues, leagues whose platform we don't support yet).

The strategic effect: **if every fantasy API died tomorrow, PotKeeper still ships and still earns**. We become "the LeagueSafe-but-better with optional auto-sync from your fantasy app." Smaller market, same product.

This is how Buffer survived Twitter API tightening, how Mint survived bank API restrictions, how Loom stayed multi-platform. Don't be a single-platform company.

### Tactical posture

- **No platform trademarks in branding.** "Works with Sleeper" is fine, "Sleeper-Powered Money Leagues" is asking for trouble.
- **BD outreach to Sleeper before launch.** Position: "we increase Sleeper retention by removing the #1 reason commissioners quit paid leagues."
- **Diversify early.** Sleeper at launch, ESPN at launch, Yahoo in Q1 2027, then NFL Fantasy and MyFantasyLeague.
- **Health checks + graceful degradation.** When ESPN cookies expire en masse, the app does not crash; it tells affected leagues "ESPN sync is paused, please reconnect" and continues to operate everything else.

## What Success Looks Like

### Year 1 (Aug 2026 - Aug 2027)
- 1,000 leagues
- $1.2M GMV
- $45K platform revenue
- Zero unauthorized payouts
- App Store rating 4.6+
- One real "PotKeeper saved our league" story per month, organic

### Year 3 (Aug 2028 - Aug 2029)
- 25,000 leagues
- $30M GMV
- ~$1M platform revenue + premium + sponsorship
- Recognized as the LeagueSafe alternative on Reddit and fantasy podcasts
- 2-3 creator-branded leagues with 5K+ members each
- Modest seed round closed if we want to push harder

### Year 5
- 100,000 leagues
- $120M GMV
- $4-5M ARR
- Decision point: stay bootstrapped or raise to expand into NBA / NHL / soccer / European fantasy

## Open Questions (revisit before paid pilot)

- Do we capture float yield, or rebate it to leagues as a marketing line ("your pot grows during the season")?
- Premium commissioner tier: monthly or annual?
- Do we let leagues self-define payout rules (free-form), or constrain to template rules (1st/2nd/3rd, last-place fee, weekly highest, etc.)?
- Charity partner curation: who's on the list? 501(c)(3) only, or include local nonprofits?
- LLC formation: now, or after first paid pilot?
- Do we need a lawyer review before the first dollar moves? (Probably yes, ~$2-5K spend with a fantasy-sports specialist firm like Ifrah Law, Brownstein Hyatt, or Fox Rothschild.)
- Co-founder or solo? Tell whom what when.

### Locked decisions (April 2026 workshop) — captured here for traceability

- ✅ **Tagline**: "Keep the pot. Skip the drama." (App Store subtitle: "Auto-paid fantasy leagues")
- ✅ **Brand color**: green primary (`#22C55E`); gold reserved for trophy moments only
- ✅ **Logo**: locked April 2026 (rounded green pot + gold crown + white keyhole + two-tone wordmark)
- ✅ **Eligibility model**: hard block at signup for restricted states + 18+ requirement (not spectator mode). Three-checkpoint enforcement: signup declaration → Stripe SetupIntent billing verification → webhook reconciliation. See `TECH_SPEC.md` §10.
- ✅ **Cross-state leagues**: not supported in v1. Mixed-state leagues cannot be created. Source-platform commissioner in restricted state = league cannot be converted.
- ✅ **Non-playing commissioner role**: deferred to v2 (commissioner must be a paying member at v1).
- ✅ **App Store strategy**: App Store is the primary launch surface, target Sept 5, 2026 live (before NFL kickoff Sept 10). Submit July 20-25 with 6-week review buffer. TestFlight repositioned as internal beta only (June friends-and-family, July creator cohort, not public). Web app at potkeeper.app as fallback parachute. Pre-launch spend ~$3,500-7,000 (LLC, fantasy-sports lawyer for ToS, 5.3 specialist for pre-submission review).
- ✅ **FF Expo**: $950 VIP Exhibition Booth + Cornhole Tournament sponsorship + Saturday after-party at a Canton bar.
- ✅ **Sponsored fan-group leagues (Phase 0.75)**: 1:1 match capped at $500 boost per league, 5 leagues v1 ($2,500 cap), $25 minimum per-member buy-in, 80% members-paid threshold for boost release by Sept 8 NFL kickoff. Codes issued per partner via `sponsorship_codes` table; one season only, no perpetual subsidies. Kill switch: <40% Year-2 renewal = channel dies.

### Revisit triggers (decisions that re-open with data)

- **Cross-state league fallback**: if >15% of created leagues abandon at the eligibility warning step (measured at 100 leagues, then 500), prioritize Phase 2 fallback modes — free-to-play guest with prize cascade, league-wide manual mode, or out-of-band private accommodation. Listed in priority order in `TECH_SPEC.md` §10.
- **Deterministic-custodian legal framework**: at scale (Q1 2027 or $1M+ ARR, whichever first), commission a legal opinion letter on the "deterministic conditional escrow" framework as a path to operating in restricted states. Could meaningfully expand TAM if favorable.
- **Non-playing commissioner role**: revisit if >5% of would-be commissioners can't proceed because they're in a restricted state and have no eligible co-commissioner. Build cost is low; deferring only because commissioners-who-don't-play is an edge case.
- **Apple App Store rejection cycle count**: if 4+ rejection cycles, hire a 5.3 specialist consultant or fall back to TestFlight as the durable v1 platform.

## Competitive Landscape

| | LeagueSafe | Venmo / Cash App | PotKeeper |
|---|---|---|---|
| Holds funds in trust | ✅ | ❌ commissioner's account | ✅ |
| Auto-payout from real standings | ❌ manual | ❌ | ✅ |
| Fantasy app integration | ❌ | ❌ | ✅ |
| Charity routing | ❌ | ❌ | ✅ |
| Mobile app | ❌ web only | ✅ general purpose | ✅ purpose-built |
| Effective fee on $1,200 pot | ~$66 | $0 (but unsafe) | $30 |
| Founded | 2008 | 2009 / 2013 | 2026 |

LeagueSafe is the incumbent. They're profitable, ~17 years old, owned by SportsHub Games Network. They have not shipped meaningful new product in years. They charge more than us and do less. Their trust comes from longevity, but their UX is a 2010 web app and their reviews complain about exactly the thing we automate.

Venmo is the default zero-tool option and the single largest competitor by volume. Beating Venmo means making the *commissioner* prefer us — which is the entire ICP exercise above.

---

*Last updated: April 2026. This document is a living strategy artifact, not a specification. Edit boldly.*
