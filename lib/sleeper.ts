/**
 * Sleeper API client.
 *
 * Sleeper's public API is HTTP REST, no auth required, ~1000 RPM rate limit per IP.
 * Docs: https://docs.sleeper.com
 *
 * Real-world quirks we discovered (May 1, 2026):
 *   - The `/league/<id>/users` endpoint returns `is_owner: true` for the
 *     commissioner, but `null` (NOT `false`) for most non-commissioner rows.
 *     Treat anything not strictly `=== true` as "not commissioner."
 *   - Same endpoint frequently returns `username: null` even for valid users.
 *     If we need usernames we resolve via `/user/<user_id>` separately.
 *   - User counts can exceed roster counts (e.g. 13 users in a 12-roster league)
 *     when a member was deleted but their user row remains.
 */
import { z } from "zod";

const BASE_URL = "https://api.sleeper.app/v1";

// =============================================================================
// Schemas
// =============================================================================

export const SleeperUserSchema = z.object({
  user_id: z.string(),
  username: z.string().nullable(),
  display_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

export const SleeperLeagueSchema = z.object({
  league_id: z.string(),
  name: z.string(),
  season: z.string(),
  status: z.string().nullable().optional(),
  total_rosters: z.number().nullable().optional(),
  sport: z.string().optional(),
  previous_league_id: z.string().nullable().optional(),
  // metadata + settings + scoring_settings exist but we don't validate them strictly.
  // We pass them through as opaque jsonb to leagues.import_metadata.
  metadata: z.record(z.unknown()).nullable().optional(),
  settings: z.record(z.unknown()).nullable().optional(),
});

export const SleeperLeagueUserSchema = z.object({
  user_id: z.string(),
  // Username is often null even for valid users. Resolve separately if needed.
  username: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  // is_owner: true for commissioner, null OR false otherwise.
  is_owner: z.boolean().nullable().optional(),
  // Per-league user metadata (team name, avatars). Shape varies; we cherry-pick.
  metadata: z
    .object({
      team_name: z.string().optional(),
      avatar: z.string().optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
});

// Sleeper splits the integer + thousandths of a fantasy point across two
// fields: `fpts` (whole) and `fpts_decimal` (0-999 thousandths). We combine
// them at parse time. PA mirrors with `fpts_against` / `fpts_against_decimal`.
const SleeperRosterSettingsSchema = z
  .object({
    wins: z.number().nullable().optional(),
    losses: z.number().nullable().optional(),
    ties: z.number().nullable().optional(),
    fpts: z.number().nullable().optional(),
    fpts_decimal: z.number().nullable().optional(),
    fpts_against: z.number().nullable().optional(),
    fpts_against_decimal: z.number().nullable().optional(),
    ppts: z.number().nullable().optional(),
    ppts_decimal: z.number().nullable().optional(),
  })
  .passthrough();

export const SleeperRosterSchema = z.object({
  roster_id: z.number(),
  owner_id: z.string().nullable(),
  league_id: z.string(),
  settings: SleeperRosterSettingsSchema.nullable().optional(),
});

// Bracket entries are produced by /winners_bracket and /losers_bracket. Each
// represents one playoff match. `p` (placement) is what the playoff seeds end
// up at — e.g. p=1 is the championship bracket, p=3 the third-place game.
// `w` and `l` are roster_ids of the winner and loser of that match.
export const SleeperBracketMatchSchema = z.object({
  r: z.number(), // round
  m: z.number(), // match index within the round
  t1: z.union([z.number(), z.object({}).passthrough()]).nullable().optional(),
  t2: z.union([z.number(), z.object({}).passthrough()]).nullable().optional(),
  w: z.number().nullable().optional(),
  l: z.number().nullable().optional(),
  p: z.number().nullable().optional(),
});

export type SleeperBracketMatch = z.infer<typeof SleeperBracketMatchSchema>;

export type SleeperUser = z.infer<typeof SleeperUserSchema>;
export type SleeperLeague = z.infer<typeof SleeperLeagueSchema>;
export type SleeperLeagueUser = z.infer<typeof SleeperLeagueUserSchema>;
export type SleeperRoster = z.infer<typeof SleeperRosterSchema>;

// =============================================================================
// Errors
// =============================================================================

export class SleeperApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly endpoint?: string,
  ) {
    super(message);
    this.name = "SleeperApiError";
  }
}

export class SleeperUserNotFoundError extends SleeperApiError {
  constructor(public readonly username: string) {
    super(`Sleeper user not found: ${username}`, 404);
    this.name = "SleeperUserNotFoundError";
  }
}

// =============================================================================
// Internal: typed fetch wrapper
// =============================================================================

async function sleeperFetch<T>(
  endpoint: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET" });
  } catch (cause) {
    throw new SleeperApiError(
      `Network error fetching ${endpoint}: ${(cause as Error).message}`,
      undefined,
      endpoint,
    );
  }

  if (!res.ok) {
    throw new SleeperApiError(
      `HTTP ${res.status} from ${endpoint}`,
      res.status,
      endpoint,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    throw new SleeperApiError(
      `Failed to parse JSON from ${endpoint}: ${(cause as Error).message}`,
      res.status,
      endpoint,
    );
  }

  // Sleeper returns `null` (not 404) for missing users. Detect that here.
  if (body === null) {
    throw new SleeperApiError(
      `Sleeper returned null for ${endpoint} (resource not found)`,
      404,
      endpoint,
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new SleeperApiError(
      `Schema mismatch from ${endpoint}: ${parsed.error.message}`,
      res.status,
      endpoint,
    );
  }
  return parsed.data;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolves a Sleeper username (or user_id) to a user object.
 * Throws SleeperUserNotFoundError if the user doesn't exist.
 */
export async function getSleeperUser(usernameOrId: string): Promise<SleeperUser> {
  const trimmed = usernameOrId.trim();
  if (!trimmed) {
    throw new SleeperApiError("Username cannot be empty");
  }
  try {
    return await sleeperFetch(`/user/${encodeURIComponent(trimmed)}`, SleeperUserSchema);
  } catch (err) {
    if (err instanceof SleeperApiError && err.status === 404) {
      throw new SleeperUserNotFoundError(trimmed);
    }
    throw err;
  }
}

/**
 * Lists all NFL leagues for a Sleeper user in a given season.
 * Returns [] if the user has no leagues that season.
 */
export async function getSleeperUserLeagues(
  userId: string,
  season: string,
): Promise<SleeperLeague[]> {
  // Sleeper returns [] for empty, not null — but we guard anyway.
  return sleeperFetch(
    `/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`,
    z.array(SleeperLeagueSchema),
  );
}

/**
 * Fetches league metadata.
 */
export async function getSleeperLeague(leagueId: string): Promise<SleeperLeague> {
  return sleeperFetch(`/league/${encodeURIComponent(leagueId)}`, SleeperLeagueSchema);
}

/**
 * Lists all users in a league. Note: usernames are often null (Sleeper quirk).
 */
export async function getSleeperLeagueUsers(
  leagueId: string,
): Promise<SleeperLeagueUser[]> {
  return sleeperFetch(
    `/league/${encodeURIComponent(leagueId)}/users`,
    z.array(SleeperLeagueUserSchema),
  );
}

/**
 * Lists all rosters in a league. Use to map roster_id → owner_id (Sleeper user_id).
 */
export async function getSleeperLeagueRosters(
  leagueId: string,
): Promise<SleeperRoster[]> {
  return sleeperFetch(
    `/league/${encodeURIComponent(leagueId)}/rosters`,
    z.array(SleeperRosterSchema),
  );
}

/**
 * Convenience: returns `true` if the given user is the commissioner of the league.
 * Treats null/false/missing as "not commissioner" — only `is_owner === true` qualifies.
 */
export function isSleeperCommissioner(
  user: SleeperLeagueUser,
  userId: string,
): boolean {
  return user.user_id === userId && user.is_owner === true;
}

/**
 * Sleeper avatar URLs are derived from the avatar hash. Returns null if no avatar.
 */
export function getSleeperAvatarUrl(avatarHash: string | null | undefined): string | null {
  if (!avatarHash) return null;
  return `https://sleepercdn.com/avatars/thumbs/${avatarHash}`;
}

/**
 * Combines Sleeper's split `fpts` + `fpts_decimal` into a single fantasy-point
 * number. Returns 0 when both are null/undefined.
 *
 * Example: fpts=1452, fpts_decimal=380 → 1452.380.
 */
export function combineSleeperFpts(
  whole: number | null | undefined,
  decimal: number | null | undefined,
): number {
  const w = typeof whole === "number" ? whole : 0;
  const d = typeof decimal === "number" ? decimal : 0;
  return w + d / 1000;
}

/**
 * Final playoff bracket for a league. Returned as an array of matches.
 * Empty array is normal mid-season (Sleeper doesn't seed the bracket until
 * playoffs start).
 */
export async function getSleeperWinnersBracket(
  leagueId: string,
): Promise<SleeperBracketMatch[]> {
  return sleeperFetch(
    `/league/${encodeURIComponent(leagueId)}/winners_bracket`,
    z.array(SleeperBracketMatchSchema),
  );
}

export async function getSleeperLosersBracket(
  leagueId: string,
): Promise<SleeperBracketMatch[]> {
  return sleeperFetch(
    `/league/${encodeURIComponent(leagueId)}/losers_bracket`,
    z.array(SleeperBracketMatchSchema),
  );
}
