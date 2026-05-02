# PotKeeper — Brand Brief

> The single source of truth for brand identity, voice, color, logo direction, and AI prompt templates.
> Pair with `VISION.md` (the why), `APP_FLOW.md` (the UX), `TECH_SPEC.md` (the build).

---

## Identity

**Name**: PotKeeper

**One-liner**: The fantasy money league app where the commissioner never holds the cash.

### Tagline (canonical)

**Hero / website / App Store screenshots**:
> # Keep the pot. Skip the drama.
> PotKeeper auto-pays winners from your Sleeper, ESPN, or Yahoo league. The commissioner never holds the money.

**App Store subtitle (≤30 chars)**: `Auto-paid fantasy leagues`

**Repeated CTA / button copy**: `Auto-paid. Always.`

**Push-notification voice (one-liner closer)**: `That's a PotKeeper.`

### Tagline alternates (use sparingly, kept for variety in marketing)
- "The commissioner never holds the money." *(direct, trust-forward)*
- "Where the money goes when the commissioner doesn't." *(story-rooted)*
- "Never get ghosted by your commish again." *(Matt Miller energy, push-notification ready)*

**Vocabulary** (use these words, lean into them):
- "the pot" — the league fund
- "the keep" — funds in escrow
- "buy-in" — entry fee
- "payout" — disbursement
- "keeper" — both fantasy slang for "keeper league" and our role as fund-keeper
- "commish" — the commissioner

**Avoid these words**:
- "gambling," "wager," "bet" — we are not a gambling app, never frame it that way
- "DraftKings-style," "DFS" — we are not daily fantasy
- "wallet" — implies we hold custody (we don't, Stripe does)
- "crypto," "Web3," "blockchain" — none of these are part of the product or message

---

## Voice & Tone

### Voice (consistent across all surfaces)
- **Confident but not cocky.** We solve a real problem; we don't have to brag.
- **Casual but credible.** "Pay your buy-in" not "Initiate transaction." "Pot's at $1,200" not "Aggregated league reserves total $1,200.00."
- **Trust-forward.** Every money-touching surface gets a quiet trust signal — "held in Stripe escrow," "verified payout," "your pot is locked."
- **Direct.** Short sentences. No corporate filler.

### Tone (varies by context)

| Context | Tone | Example |
|---|---|---|
| Onboarding | Welcoming, simple | "Connect your fantasy account so we can find your leagues." |
| Trust moments (pay, payout) | Calm, reassuring | "Your buy-in is held safely in Stripe escrow until season end." |
| Trophy moments (win, championship) | Celebratory but earned | "You won $720. Sent to your bank, arrives in 1-2 days." |
| Alerts / errors | Honest, owns it | "Couldn't reach Sleeper. We'll retry — or pull to refresh." |
| Empty states | Lightly playful | "No leagues yet. Time to make one." |

---

## Color Palette (canonical)

Anchored in `global.css`. Extends shadcn/RNR tokens.

### Brand
- **Brand green**: `#22C55E` — primary CTA, brand mark, money-positive states
- **Brand green pressed**: `#16A34A` — hover, pressed, deeper accent
- **Brand green muted**: `#22C55E20` (12% opacity) — backgrounds, soft fills

### Semantic accents
- **Gold**: `#F59E0B` — winners, trophy, championship UI only (never primary)
- **Red**: `#EF4444` — alerts, refunds, dispute states only
- **Indigo**: `#6366F1` — secondary informational accent, used sparingly

### Neutrals (dark mode primary)
- Background: `#0A0A0F`
- Surface: `#15151A`
- Card: `#1C1C24`
- Border: `#2A2A33`
- Text primary: `#FAFAFA`
- Text muted: `#9999A3`

### Neutrals (light mode)
- Background: `#FFFFFF`
- Surface: `#F5F5F7`
- Card: `#FFFFFF`
- Border: `#E5E5EA`
- Text primary: `#0A0A0F`
- Text muted: `#6B6B73`

### Color philosophy
Green is the brand because money flowing correctly is the product. Gold is reserved for the moment of victory — never a UI primary, only a celebration accent. Red is strictly negative. Indigo is the quiet utility color when neither green nor gold fits.

---

## Typography

- **Headings**: Inter Display, Geist, or Plus Jakarta Sans — semibold to bold
- **Body**: Inter Regular
- **Money / numbers**: tabular figures, Inter SemiBold (so columns align in lists)

### Money formatting
- Over $100: `$1,234.56` (commas, two decimals)
- Under $100: `$50` (no decimals)
- Always currency symbol + comma separators
- In lists, right-aligned with tabular figures

### Sizes (mobile baseline)
- Display (hero amounts): 48-64pt
- H1: 32pt
- H2: 24pt
- H3: 18pt
- Body: 16pt
- Caption: 13pt
- Number plates (pot size): tabular, 32-48pt

---

## Logo Direction

### Status: **canonical mark locked April 2026**

The current logo system (rounded green pot with gold crown, white keyhole on the front of the pot, two-tone wordmark with `pot` in brand green and `keeper` in dark forest green) is the canonical brand mark. Any future regeneration must preserve:
- Pot silhouette (rounded cauldron with two small feet, wide rim/lid)
- Gold crown sitting on the lid (3-4 points, simple shape)
- White keyhole on the front-center of the pot body
- Two-tone wordmark: `pot` in brand green `#22C55E`, `keeper` in forest green (around `#15803D`)
- Soft top-to-bottom green gradient fill on the pot body

### Mark anatomy
- **Pot silhouette** — rounded cauldron with feet, wide-mouth lid; balances "vault" and "kitchen pot"
- **Crown on top** — small accent (~50-65% width of pot), denotes "winning / champion"; gold `#F59E0B`
- **Keyhole on the front of the pot** — denotes "secure / escrow"; white inset that reads on green background
- Three resonances stacked: cooking pot, fantasy keeper, secure escrow

### Wordmark
- **lowercase "potkeeper"** — friendlier, app-native, modern
- Geometric sans-serif (Inter, Plus Jakarta Sans, Geist)
- Two-tone color split at the meaningful break: **"pot"** in brand green `#22C55E`, **"keeper"** in forest green `#15803D`
- Never split mid-syllable (no "potk" / "eeper")

### Required deliverables (for any logo generation)
1. **Horizontal lockup** — mark + wordmark, for headers, marketing, web
2. **Wordmark only** — for tight horizontal spaces
3. **Mark only, square crop** — 1024×1024 for iOS app icon (no text per Apple guidelines)
4. **Dark mode variant** — light fill on dark background
5. **Monochrome** — single color version for printing, partner co-branding

### What to avoid
- Dollar signs in the mark (gambling-coded)
- Slot machine, dice, playing card motifs
- Neon, glow effects, "casino" gradients
- Realistic photography (we're a vector brand)
- Emojis baked into the logo

---

## AI Prompt Template (for ChatGPT / Midjourney / Claude)

Use this verbatim or near-verbatim when regenerating the logo. Tested to produce consistent results.

```
Generate a clean, modern logo system for "PotKeeper," a fintech mobile app for fantasy
football league money management. Trust-forward, not gambling-coded. The mark should
combine three elements: a stylized wide-mouth pot or cauldron silhouette, a small crown
sitting on top, and a small padlock or keyhole on the front of the pot. Keep proportions
balanced — the crown should feel like a small accent (~50-60% width of the pot), not
dominant. Use a monochromatic fill with subtle gradient. Wordmark in lowercase
"potkeeper" using a modern geometric sans-serif font like Inter, Plus Jakarta Sans, or
Geist. If using a two-tone wordmark, split at "pot" / "keeper" — never mid-syllable.

Provide 5 deliverables in one image, on transparent backgrounds:
(1) horizontal lockup with mark + wordmark
(2) wordmark only
(3) mark only, square crop suitable for iOS app icon at 1024×1024 (no text)
(4) dark-mode variant with light fill on dark background
(5) monochrome single-color version

Primary color: green #22C55E. Secondary accent for the crown: gold #F59E0B (small touch
only, optional). Avoid neon, gambling motifs, dollar signs, dice, slot machines, or
anything that looks like a casino. The vibe is Robinhood meets Sleeper meets Stripe
Dashboard — confident, calm, financial-utility, sports-adjacent.
```

---

---

## Animation & Motion

Two Lotties to commission for v1. Both delivered together by one animator, ~$200-350 total.

### Lottie 1: Splash screen — "Seal the Pot"

The most fintech-serious of the three concepts we explored. Reads as **secure** without being sterile. Plays once on app boot.

**Duration**: 2.0-2.4 seconds

| Time | Action | Brand element |
|---|---|---|
| 0.0-0.5s | Pot silhouette fades in and scales from 90% → 100% | The vessel |
| 0.4-0.9s | Crown lowers from above with a small bounce on landing | Winning |
| 0.8-1.3s | Lock/keyhole draws onto the front via path-stroke, then a small "click" snap | Security |
| 1.1-1.6s | Soft brand-green glow pulses outward from the pot once | Money positive |
| 1.4-2.0s | Wordmark "potkeeper" fades in below the mark (two-tone reveal: `pot` first, then `keeper`) | Identity |
| 2.0-2.4s | Hold final frame, then app loads | — |

**Colors**:
- Pot fill: brand green gradient `#22C55E` → `#16A34A`
- Crown: gold `#F59E0B`
- Lock/keyhole: white `#FAFAFA`
- Glow pulse: brand green at 30% opacity, expanding ring
- Wordmark: `pot` in `#22C55E`, `keeper` in `#15803D`

**Background**: transparent (sits on dark `#0A0A0F` app background)

### Lottie 2: Payout celebration — "The Win"

The high-leverage Lottie. Plays once when a member opens the app to find they won and the Stripe transfer settled. This is the moment users film and post — it earns its budget many times over.

**Duration**: 3.0-4.0 seconds (one-shot)

| Time | Action |
|---|---|
| 0.0-0.5s | Crown bounces up from offscreen-bottom, lands center, slight wobble |
| 0.3-0.8s | Brand-green confetti burst radiates outward from crown center (50-80 particles) |
| 0.5-1.5s | Money amount counts up from `$0` to the won amount, large display type, tabular figures |
| 1.0-2.0s | Gold confetti second wave, slower, drifting downward |
| 1.5-2.5s | Subtle screen shake on the final beat (handled in JS, not Lottie) |
| 2.0-3.5s | "Sent to your bank — arrives in 1-2 days" subtext fades in |
| 3.5-4.0s | Settle, hold final frame |

**Colors**:
- Crown: gold `#F59E0B`
- Confetti: brand green `#22C55E`, gold `#F59E0B`, white `#FAFAFA` (no other colors)
- Money amount: `#FAFAFA` (or brand green for the cents portion)
- Subtext: `#9999A3`

**Implementation note**: the count-up animation is best handled via JS (`react-native-reanimated`) reading the actual payout amount, not baked into Lottie. The Lottie provides the confetti + crown beats; JS layers the dynamic number on top.

### Bonus animations (Phase 2)
- **Pot filling up** — for league dashboard when a member just paid (300ms, plays inline)
- **Standings authorization "lock click"** — when all members authorize the payout window (500ms)

These are quick wins after launch; not required for v1.

### Animator brief (paste verbatim when commissioning)

```
I need TWO Lottie animations for a mobile app called "PotKeeper" — a fintech app for
fantasy football money league management. Trust-forward, premium, modern. Think
Robinhood meets Sleeper meets Stripe Dashboard.

LOGO REFERENCE: I will provide a PNG of the locked logo system (rounded green pot,
gold crown on top, white keyhole on front, two-tone "potkeeper" wordmark).

ANIMATION 1 — Splash screen "Seal the Pot" (2.0-2.4 seconds, plays once)
1. (0.0-0.5s) Pot silhouette fades in, scales 90% → 100%
2. (0.4-0.9s) Crown lowers from above, small bounce on landing
3. (0.8-1.3s) Lock/keyhole draws on front via path-stroke, then small click effect
4. (1.1-1.6s) Soft brand-green glow pulses outward once
5. (1.4-2.0s) Wordmark "potkeeper" fades in below the mark
6. (2.0-2.4s) Hold final frame

ANIMATION 2 — Payout celebration "The Win" (3.0-4.0 seconds, plays once)
1. (0.0-0.5s) Crown bounces up from bottom, lands center
2. (0.3-0.8s) Brand-green confetti burst from crown center (50-80 particles)
3. (1.0-2.0s) Gold confetti second wave, slower, drifting down
4. (3.5-4.0s) Settle, hold final frame
   (We will overlay a counting-up dollar amount via JS — leave a clear safe area
    in the center of frame for ~120pt text; do not bake any text into this Lottie)

COLORS (use these exact hex values):
- Brand green: #22C55E
- Brand green pressed/darker: #16A34A
- Forest green: #15803D
- Gold: #F59E0B
- White: #FAFAFA
- Background: transparent

DELIVERABLES (for both animations):
- Lottie JSON file (.json) — final production asset
- After Effects source (.aep) — so we can spin off variants
- 1080x1920 MP4 preview at 60fps
- 600x600 MP4 preview at 60fps for desktop testing

AVOID: dollar signs, dice, slot-machine effects, neon, casino aesthetics,
sparkles that read as "magic" instead of "money."

Total budget: $200-350 for both animations. Timeline: 7-10 days.
```

---

## Mascot / Illustration Direction (optional, Phase 2)

If we decide to add a mascot character (separate from the logo for friendly contexts only):

- **Working name**: "Stickr" (the potsticker) — a round dumpling character with a small goalie mask or catcher's mitt, defending the pot
- **Use sparingly**: empty states, push notifications, swag, marketing illustrations
- **Never in core trust UI**: payment screens, payout screens, standings authorization
- **Trust face**: clean wordmark + mark
- **Personality face**: Stickr the potsticker
- **Two characters, two jobs** — like Discord (Wumpus + wordmark) or MailChimp (Freddie + wordmark)

---

## Do's and Don'ts

### Do
- Lead with green
- Use gold only at trophy/celebration moments
- Right-align numbers in lists
- Surface trust signals on every money screen
- Keep copy short, direct, casual
- Use real numbers in mocks (not "$XXX")

### Don't
- Use the word "wager" or "gamble"
- Use neon or slot-machine aesthetics
- Bury the pot size — it's the iconic number
- Use stock photography
- Add "DK" / "DraftKings" style flame icons
- Add dollar signs to the logo
- Mix greens (one green, one shade for pressed)

---

*Last updated: April 2026. Edit boldly.*
