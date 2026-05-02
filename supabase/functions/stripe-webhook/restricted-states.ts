// Restricted-state list for the webhook's billing-state check (Checkpoint 2/3).
//
// MUST stay in sync with `lib/eligibility.ts` in the app. We can't share a
// single module because Deno (edge functions) and Metro (app bundler) live
// in different module systems. If you change one, change both, and add a
// migration hook to the deploy checklist in TECH_SPEC.md.

export const RESTRICTED_STATES: ReadonlySet<string> = new Set([
  "WA",
  "ID",
  "HI",
  "MT",
  "LA",
  "NV",
]);
