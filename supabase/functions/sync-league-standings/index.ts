// Edge function: sync-league-standings
//
// Pulls fresh standings for a single league from the source platform (Sleeper
// only in Pass 1), normalizes them, and writes a new row to
// public.standings_snapshots. The latest row is what the Standings tab reads.
//
// Pass 1 trigger: manual, called from the league detail screen's refresh
// button. Pass 2 will add a `pg_cron` 6h tick that walks `leagues` where
// status != 'complete' and calls this same function.
//
// Pass 1 ranking: regular-season wins desc, points-for desc tiebreaker. Final
// playoff bracket parsing is Pass 2.
//
// Request:
//   POST /functions/v1/sync-league-standings
//   Authorization: Bearer <user JWT>
//   Body: { league_id: uuid, force?: boolean }
//
// Response:
//   200 { snapshot: SnapshotRow, throttled: boolean }
//   4xx { error: string }
//
// Spec coverage: docs/TECH_SPEC.md §3.9 (table) + §4.1 (Sleeper APIs).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AuthorizationError,
  openAuthorizationWindow,
} from "../shared/authorization.ts";

const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";

// Throttle: if the last snapshot is younger than this, skip the sync and
// return the existing row. UI can override with `force: true` for hard
// refresh, but that's not exposed in Pass 1 UI yet.
const MIN_SYNC_INTERVAL_MS = 60_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================================
// Types — loose JSON shapes from Sleeper. See lib/sleeper.ts for the
// authoritative client-side schemas.
// ============================================================================

interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status?: string | null;
  total_rosters?: number | null;
  settings?: { leg?: number | null } & Record<string, unknown>;
}

interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  settings?: {
    wins?: number | null;
    losses?: number | null;
    ties?: number | null;
    fpts?: number | null;
    fpts_decimal?: number | null;
    fpts_against?: number | null;
    fpts_against_decimal?: number | null;
  } & Record<string, unknown>;
}

interface RequestBody {
  league_id: string;
  force?: boolean;
}

interface NormalizedStanding {
  rank: number;
  league_member_id: string | null;
  external_user_id: string | null;
  roster_id: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
}

// ============================================================================
// Sleeper helpers
// ============================================================================

async function sleeperGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SLEEPER_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Sleeper ${path} returned HTTP ${res.status}`);
  }
  const body = await res.json();
  if (body === null) {
    throw new Error(`Sleeper ${path} returned null (resource not found)`);
  }
  return body as T;
}

function combineFpts(
  whole: number | null | undefined,
  decimal: number | null | undefined,
): number {
  const w = typeof whole === "number" ? whole : 0;
  const d = typeof decimal === "number" ? decimal : 0;
  return w + d / 1000;
}

// ============================================================================
// Main
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  // 1. Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError(401, "Missing or invalid Authorization header");
  }
  const jwt = authHeader.slice("Bearer ".length);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError(500, "Edge function not configured (missing env vars)");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user) {
    return jsonError(401, `Invalid auth token: ${userError?.message ?? "unknown"}`);
  }
  const profileId = userData.user.id;

  // 2. Parse body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError(400, "Body must be valid JSON");
  }
  if (!body.league_id || typeof body.league_id !== "string") {
    return jsonError(400, "league_id (uuid) is required");
  }

  // 3. Load league + verify caller is a member
  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select("id, platform, external_league_id, season, status")
    .eq("id", body.league_id)
    .maybeSingle();
  if (leagueError) {
    return jsonError(500, `League lookup failed: ${leagueError.message}`);
  }
  if (!league) {
    return jsonError(404, "League not found");
  }
  if (league.platform !== "sleeper") {
    // Pass 1 only supports Sleeper. ESPN/Yahoo will get parallel sync paths
    // when their importers ship.
    return jsonError(400, `Platform ${league.platform} not supported in Pass 1`);
  }

  const { data: callerMembership, error: membershipError } = await adminClient
    .from("league_members")
    .select("id")
    .eq("league_id", league.id)
    .eq("linked_profile_id", profileId)
    .maybeSingle();
  if (membershipError) {
    return jsonError(500, `Membership check failed: ${membershipError.message}`);
  }
  if (!callerMembership) {
    return jsonError(403, "You must be a member of this league to sync standings");
  }

  // 4. Throttle: if we have a fresh snapshot, return it instead of refetching
  if (!body.force) {
    const { data: latest } = await adminClient
      .from("standings_snapshots")
      .select("*")
      .eq("league_id", league.id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      const ageMs = Date.now() - new Date(latest.fetched_at).getTime();
      if (ageMs < MIN_SYNC_INTERVAL_MS) {
        return jsonOk({ snapshot: latest, throttled: true });
      }
    }
  }

  // 5. Fetch fresh from Sleeper
  let sleeperLeague: SleeperLeague;
  let rosters: SleeperRoster[];
  try {
    [sleeperLeague, rosters] = await Promise.all([
      sleeperGet<SleeperLeague>(
        `/league/${encodeURIComponent(league.external_league_id)}`,
      ),
      sleeperGet<SleeperRoster[]>(
        `/league/${encodeURIComponent(league.external_league_id)}/rosters`,
      ),
    ]);
  } catch (e) {
    return jsonError(502, `Sleeper API error: ${(e as Error).message}`);
  }

  // 6. Build owner_id → league_members.id map so the snapshot ties standings
  //    rows back to our DB members (not just Sleeper user_ids).
  const { data: members, error: membersError } = await adminClient
    .from("league_members")
    .select("id, external_user_id")
    .eq("league_id", league.id);
  if (membersError) {
    return jsonError(500, `Members lookup failed: ${membersError.message}`);
  }
  const memberIdByExternal = new Map<string, string>();
  for (const m of members ?? []) {
    if (m.external_user_id) memberIdByExternal.set(m.external_user_id, m.id);
  }

  // 7. Normalize + rank. Pass 1 ranking: wins desc, then PF desc.
  const normalized: NormalizedStanding[] = rosters
    .map((r) => {
      const s = r.settings ?? {};
      return {
        rank: 0, // filled in after sort
        league_member_id: r.owner_id
          ? memberIdByExternal.get(r.owner_id) ?? null
          : null,
        external_user_id: r.owner_id,
        roster_id: r.roster_id,
        wins: typeof s.wins === "number" ? s.wins : 0,
        losses: typeof s.losses === "number" ? s.losses : 0,
        ties: typeof s.ties === "number" ? s.ties : 0,
        points_for: combineFpts(s.fpts, s.fpts_decimal),
        points_against: combineFpts(s.fpts_against, s.fpts_against_decimal),
      };
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.points_for - a.points_for;
    })
    .map((row, i) => ({ ...row, rank: i + 1 }));

  // 8. Write the snapshot
  const isFinal = sleeperLeague.status === "complete";
  const currentWeek =
    typeof sleeperLeague.settings?.leg === "number"
      ? sleeperLeague.settings.leg
      : null;

  const { data: snapshot, error: insertError } = await adminClient
    .from("standings_snapshots")
    .insert({
      league_id: league.id,
      is_final: isFinal,
      current_week: currentWeek,
      season_status: sleeperLeague.status ?? null,
      standings: normalized,
      raw_data: {
        fetched_at: new Date().toISOString(),
        league: sleeperLeague,
        rosters,
      },
    })
    .select()
    .single();

  if (insertError || !snapshot) {
    return jsonError(
      500,
      `Failed to write snapshot: ${insertError?.message ?? "unknown"}`,
    );
  }

  // 9. Update leagues.status if it drifted (Sleeper is authoritative).
  if (sleeperLeague.status && sleeperLeague.status !== league.status) {
    const { error: statusUpdateError } = await adminClient
      .from("leagues")
      .update({ status: sleeperLeague.status })
      .eq("id", league.id);
    if (statusUpdateError) {
      // Non-fatal — surface for ops follow-up. The next sync will retry.
      console.warn(
        `[sync-league-standings] failed to update league status: ${statusUpdateError.message}`,
      );
    }
  }

  // 10. Auto-open authorization window. Pass 2B Fix A: the moment a final
  // snapshot lands we open the 72h window without waiting for the
  // commissioner to tap the CTA. This is the trust pitch — PotKeeper runs
  // the close-out flow autonomously. The shared opener is idempotent
  // (`already_started` is a no-op) so a second sync after `is_final` is
  // safe.
  let autoAuthorization:
    | { opened: true; snapshot_id: number; pending_count: number; window_hours: number }
    | { opened: false; reason: string }
    | null = null;

  if (isFinal) {
    try {
      const result = await openAuthorizationWindow({
        adminClient,
        leagueId: league.id,
      });
      autoAuthorization = {
        opened: true,
        snapshot_id: result.snapshot_id,
        pending_count: result.pending_count,
        window_hours: result.window_hours,
      };
      console.log(
        `[sync-league-standings] auto-opened authorization window for league=${league.id} pending=${result.pending_count}`,
      );
    } catch (e) {
      if (e instanceof AuthorizationError) {
        // `already_started` is the common case on re-sync — not a problem.
        // `no_linked_members` is rare but possible (commissioner only).
        // Surface either as a soft signal so the client can show a toast
        // ("Standings final · authorization already open") without
        // blocking the snapshot write.
        autoAuthorization = { opened: false, reason: e.code };
        if (e.code !== "already_started") {
          console.warn(
            `[sync-league-standings] auto-open failed for league=${league.id} code=${e.code} msg=${e.message}`,
          );
        }
      } else {
        console.error(
          `[sync-league-standings] auto-open threw for league=${league.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
        autoAuthorization = { opened: false, reason: "internal_error" };
      }
    }
  }

  return jsonOk({ snapshot, throttled: false, auto_authorization: autoAuthorization });
});

// ============================================================================
// Helpers
// ============================================================================

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
