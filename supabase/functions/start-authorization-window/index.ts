// Edge function: start-authorization-window
//
// Sprint 4 Pass 1. Opens the standings authorization window (APP_FLOW Screen
// 8.2). Commissioner-only.
//
// Pass 2B note: the actual opener engine moved to ../shared/authorization.ts
// so sync-league-standings can auto-open the window the moment a final
// snapshot lands. This function is now a thin auth wrapper around it — the
// commissioner CTA on Screen 8.2 still works as a manual fallback if the
// auto-open ever no-ops (e.g. no linked members yet).
//
// Request:
//   POST /functions/v1/start-authorization-window
//   Authorization: Bearer <user JWT>
//   Body: { league_id: uuid, window_hours?: number (default 72, min 24, max 168) }
//
// Response:
//   200 { league: LeagueRow, snapshot_id: number, pending_count: number }
//   4xx { error: string }
//
// Spec coverage: docs/APP_FLOW.md Flow 8 + docs/TECH_SPEC.md §12 Sprint 4.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AuthorizationError,
  openAuthorizationWindow,
} from "../shared/authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  league_id: string;
  window_hours?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

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

  const { data: userData, error: userError } = await userClient.auth.getUser(
    jwt,
  );
  if (userError || !userData.user) {
    return jsonError(
      401,
      `Invalid auth token: ${userError?.message ?? "unknown"}`,
    );
  }
  const profileId = userData.user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError(400, "Body must be valid JSON");
  }
  if (!body.league_id || typeof body.league_id !== "string") {
    return jsonError(400, "league_id (uuid) is required");
  }

  // Commissioner check before delegating. The shared opener doesn't gate on
  // identity — it's reused by the system auto-open path which has no caller.
  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select("commissioner_profile_id")
    .eq("id", body.league_id)
    .maybeSingle();
  if (leagueError) {
    return jsonError(500, `League lookup failed: ${leagueError.message}`);
  }
  if (!league) {
    return jsonError(404, "League not found");
  }
  if (league.commissioner_profile_id !== profileId) {
    return jsonError(403, "Only the commissioner can open the window");
  }

  try {
    const result = await openAuthorizationWindow({
      adminClient,
      leagueId: body.league_id,
      windowHours: body.window_hours,
    });
    return jsonOk({
      league: result.league,
      snapshot_id: result.snapshot_id,
      pending_count: result.pending_count,
    });
  } catch (e) {
    if (e instanceof AuthorizationError) {
      const status = mapAuthorizationErrorStatus(e.code);
      return jsonError(status, e.message);
    }
    return jsonError(
      500,
      `Failed to open window: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
});

function mapAuthorizationErrorStatus(code: string): number {
  switch (code) {
    case "league_not_found":
      return 404;
    case "already_started":
      return 409;
    case "no_final_snapshot":
    case "no_linked_members":
      return 400;
    default:
      return 500;
  }
}

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
