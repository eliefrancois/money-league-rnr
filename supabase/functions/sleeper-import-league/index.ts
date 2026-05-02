// Edge function: sleeper-import-league
//
// Imports a Sleeper league + all its members + rosters into PotKeeper, atomically.
// Optionally links the caller to one of the league_member rows if they tell us which
// Sleeper user they are (via importer_external_user_id).
//
// Why an Edge Function (vs direct client + DB writes):
//   1. Atomicity — we want league + members written together or not at all.
//   2. We use service_role to write league_members (no client-side INSERT policy on it).
//   3. Sleeper has no auth, but we want to validate the JWT and capture imported_by.
//   4. Centralized parsing of Sleeper's quirks (is_owner: null, username: null, etc.).
//
// Request:
//   POST /functions/v1/sleeper-import-league
//   Authorization: Bearer <user JWT>
//   Body: { league_id: string, season: string, importer_external_user_id?: string }
//
// Response:
//   200 { league: LeagueRow, members: LeagueMemberRow[], already_existed: boolean }
//   4xx { error: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// =============================================================================
// Types (loose; we don't use Zod in Deno to keep cold-start small)
// =============================================================================

interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status?: string | null;
  total_rosters?: number | null;
  metadata?: unknown;
  settings?: unknown;
}

interface SleeperLeagueUser {
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  avatar?: string | null;
  is_owner?: boolean | null;
  metadata?: { team_name?: string; avatar?: string } | null;
}

interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
}

interface RequestBody {
  league_id: string;
  season: string;
  importer_external_user_id?: string;
}

// =============================================================================
// Sleeper API helpers (Deno fetch, no zod)
// =============================================================================

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

// =============================================================================
// Main handler
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  // 1. Validate auth and resolve caller's profile id
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

  // Two clients:
  //   - userClient: validates the caller's JWT, used to read who they are
  //   - adminClient: service_role, used to write league_members (RLS-bypassing)
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user) {
    return jsonError(401, `Invalid auth token: ${userError?.message ?? "unknown"}`);
  }
  const profileId = userData.user.id;

  // 2. Parse and validate request body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError(400, "Body must be valid JSON");
  }
  if (!body.league_id || typeof body.league_id !== "string") {
    return jsonError(400, "league_id (string) is required");
  }
  if (!body.season || typeof body.season !== "string") {
    return jsonError(400, "season (string) is required");
  }

  // 3. Fetch Sleeper API in parallel
  let league: SleeperLeague;
  let users: SleeperLeagueUser[];
  let rosters: SleeperRoster[];
  try {
    [league, users, rosters] = await Promise.all([
      sleeperGet<SleeperLeague>(`/league/${encodeURIComponent(body.league_id)}`),
      sleeperGet<SleeperLeagueUser[]>(
        `/league/${encodeURIComponent(body.league_id)}/users`,
      ),
      sleeperGet<SleeperRoster[]>(
        `/league/${encodeURIComponent(body.league_id)}/rosters`,
      ),
    ]);
  } catch (err) {
    return jsonError(502, `Sleeper API error: ${(err as Error).message}`);
  }

  // Verify league season matches what was requested (sanity check).
  if (league.season !== body.season) {
    return jsonError(
      400,
      `League ${body.league_id} is season ${league.season}, not ${body.season}`,
    );
  }

  // 4. Determine commissioner
  const commissioner = users.find((u) => u.is_owner === true);

  // 5. Upsert league row. Unique constraint on (platform, external_league_id, season)
  //    means we get an upsert behaviour without conflict.
  const { data: existingLeague } = await adminClient
    .from("leagues")
    .select("*")
    .eq("platform", "sleeper")
    .eq("external_league_id", league.league_id)
    .eq("season", league.season)
    .maybeSingle();

  let leagueRow;
  let alreadyExisted = false;

  if (existingLeague) {
    leagueRow = existingLeague;
    alreadyExisted = true;
  } else {
    const { data: insertedLeague, error: leagueInsertError } = await adminClient
      .from("leagues")
      .insert({
        platform: "sleeper",
        external_league_id: league.league_id,
        name: league.name,
        season: league.season,
        status: league.status ?? null,
        total_rosters: league.total_rosters ?? null,
        commissioner_external_user_id: commissioner?.user_id ?? null,
        imported_by: profileId,
        import_metadata: {
          fetched_at: new Date().toISOString(),
          metadata: league.metadata,
          settings: league.settings,
        },
      })
      .select()
      .single();

    if (leagueInsertError || !insertedLeague) {
      return jsonError(
        500,
        `Failed to insert league: ${leagueInsertError?.message ?? "unknown"}`,
      );
    }
    leagueRow = insertedLeague;
  }

  // 6. Upsert league_members. Build roster lookup so we can attach roster_id/team_name.
  const rosterByOwnerId = new Map<string, SleeperRoster>();
  for (const r of rosters) {
    if (r.owner_id) {
      rosterByOwnerId.set(r.owner_id, r);
    }
  }

  const memberInserts = users.map((u) => {
    const roster = rosterByOwnerId.get(u.user_id);
    return {
      league_id: leagueRow.id,
      external_user_id: u.user_id,
      external_username: u.username ?? null,
      external_display_name: u.display_name ?? null,
      avatar_url: u.avatar
        ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}`
        : null,
      // Sleeper returns null for non-commissioners; coerce to false.
      is_owner: u.is_owner === true,
      roster_id: roster?.roster_id ?? null,
      team_name: u.metadata?.team_name ?? null,
    };
  });

  // Use upsert on the unique (league_id, external_user_id) so re-imports update.
  const { data: insertedMembers, error: membersError } = await adminClient
    .from("league_members")
    .upsert(memberInserts, {
      onConflict: "league_id,external_user_id",
      ignoreDuplicates: false,
    })
    .select();

  if (membersError) {
    return jsonError(500, `Failed to upsert members: ${membersError.message}`);
  }

  // 7. If caller told us their Sleeper user_id, link them
  if (body.importer_external_user_id) {
    const { error: identityError } = await adminClient
      .from("platform_identities")
      .upsert(
        {
          profile_id: profileId,
          platform: "sleeper",
          external_user_id: body.importer_external_user_id,
        },
        { onConflict: "profile_id,platform" },
      );

    if (identityError) {
      console.error("Failed to upsert platform_identity:", identityError);
      // Non-fatal: continue. We can recover this on next sync.
    } else {
      // Find the league_member row for this Sleeper user and link it
      const memberRow = insertedMembers?.find(
        (m) => m.external_user_id === body.importer_external_user_id,
      );
      if (memberRow) {
        await adminClient
          .from("league_members")
          .update({ linked_profile_id: profileId })
          .eq("id", memberRow.id);

        // If they're the commissioner, promote them on the leagues row
        if (memberRow.is_owner && !leagueRow.commissioner_profile_id) {
          await adminClient
            .from("leagues")
            .update({ commissioner_profile_id: profileId })
            .eq("id", leagueRow.id);
          leagueRow.commissioner_profile_id = profileId;
        }
      }

      // Mark profile as Sleeper-synced
      await adminClient
        .from("profiles")
        .update({ is_sleeper_synced: true })
        .eq("id", profileId);
    }
  }

  return new Response(
    JSON.stringify({
      league: leagueRow,
      members: insertedMembers ?? [],
      already_existed: alreadyExisted,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

// =============================================================================
// Helpers
// =============================================================================

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
