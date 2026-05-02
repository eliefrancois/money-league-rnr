/**
 * Eligibility constants + helpers for Checkpoint 1 (signup gate).
 *
 * See docs/TECH_SPEC.md §10 for the three-checkpoint architecture and the
 * legal rationale behind the restricted-state list. The list here mirrors
 * Phase 1 (must be confirmed with counsel before launch).
 */

export const MIN_AGE = 18;

/**
 * 2-letter codes for states where PotKeeper is hard-blocked at signup.
 * Source: TECH_SPEC.md §10 → "Restricted state list (Phase 1)".
 */
export const RESTRICTED_STATES: ReadonlySet<string> = new Set([
  "WA", // State AG opinion treats paid fantasy as gambling
  "ID", // State AG opinion explicitly bans paid fantasy
  "HI", // No legal framework permits paid fantasy
  "MT", // Only state-authorized contests
  "LA", // Parish-specific; conservative full-state block until per-parish list
  "NV", // Has its own DFS framework; requires licensure
]);

export type USState = {
  code: string;
  name: string;
};

/**
 * Full US state + territory list for the signup state dropdown. Sorted by
 * name for the dropdown UI. Restricted states are *included* — the form
 * shows them but the submit handler hard-blocks before continuing, which
 * makes the "we're not available in your state" copy specific.
 */
export const US_STATES: ReadonlyArray<USState> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export function isRestrictedState(stateCode: string | null | undefined): boolean {
  if (!stateCode) return false;
  return RESTRICTED_STATES.has(stateCode.toUpperCase());
}

export function getStateName(stateCode: string | null | undefined): string {
  if (!stateCode) return "";
  const match = US_STATES.find((s) => s.code === stateCode.toUpperCase());
  return match?.name ?? stateCode.toUpperCase();
}

/**
 * Calculate age in whole years from a date-of-birth (ISO string or Date).
 * Returns null if the input is unparseable. Uses local time (good enough for
 * a self-declaration; we don't claim millisecond accuracy).
 */
export function calculateAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const birth = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(birth.getTime())) return null;

  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    years--;
  }
  return years;
}

export function isMinor(dob: string | Date | null | undefined): boolean {
  const age = calculateAge(dob);
  if (age == null) return false;
  return age < MIN_AGE;
}

/**
 * Format a Date as a YYYY-MM-DD string suitable for `profiles.date_of_birth`
 * (Postgres `date` column). Independent of timezone.
 */
export function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
