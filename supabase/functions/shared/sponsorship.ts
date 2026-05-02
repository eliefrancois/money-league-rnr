// Shared sponsorship boost helpers (Pass 2C).
// Used by `sponsorship-boost-tick` and optionally tests.

export interface ParsedSponsorshipConditions {
  min_members_paid_pct: number;
  min_buy_in_cents: number;
  must_use_auto_payout: boolean;
  season: number | null;
}

export function parseSponsorshipConditions(raw: unknown): ParsedSponsorshipConditions {
  const d = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const pct = Number(d.min_members_paid_pct ?? 0.8);
  const minBuy = Number(d.min_buy_in_cents ?? 2500);
  const mustAuto =
    d.must_use_auto_payout === undefined ? true : Boolean(d.must_use_auto_payout);
  const seasonRaw = d.season;
  const season =
    typeof seasonRaw === "number" && Number.isFinite(seasonRaw)
      ? seasonRaw
      : typeof seasonRaw === "string" && /^\d+$/.test(seasonRaw)
      ? parseInt(seasonRaw, 10)
      : null;
  return {
    min_members_paid_pct: Number.isFinite(pct) ? pct : 0.8,
    min_buy_in_cents: Number.isFinite(minBuy) ? Math.max(0, minBuy) : 2500,
    must_use_auto_payout: mustAuto,
    season,
  };
}

export function computeSponsorshipBoostCents(args: {
  memberPotCents: number;
  boostMaxCents: number;
  matchRatio: number;
}): number {
  const cap = Math.max(0, Math.floor(args.boostMaxCents));
  const ratio = Number.isFinite(args.matchRatio) ? args.matchRatio : 1;
  const raw = Math.floor(args.memberPotCents * ratio);
  return Math.min(Math.max(0, raw), cap);
}
