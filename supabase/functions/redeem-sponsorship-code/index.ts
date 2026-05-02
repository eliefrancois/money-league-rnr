// Edge function: redeem-sponsorship-code
//
// Commissioner applies a PotKeeper sponsorship code to their league during
// buy-in setup (Pass 2C). Service role updates `sponsorship_codes` + league;
// clients never read the codes table directly.
//
// Request:
//   POST /functions/v1/redeem-sponsorship-code
//   Authorization: Bearer <user JWT>
//   Body: { league_id: uuid, code: string }
//
// Response:
//   200 { ok: true, partner_name: string, boost_max_cents: number, expires_at: string }
//   4xx { error: string }  — invalid_code | expired | already_redeemed | league_locked | etc.
//
// Spec: docs/TECH_SPEC.md §3.11

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  league_id: string;
  code: string;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
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

  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user) {
    return jsonError(401, `Invalid auth token: ${userError?.message ?? "unknown"}`);
  }
  const profileId = userData.user.id;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError(400, "Body must be valid JSON");
  }
  if (!body.league_id || typeof body.league_id !== "string") {
    return jsonError(400, "league_id is required");
  }
  if (!body.code || typeof body.code !== "string") {
    return jsonError(400, "code is required");
  }

  const codeNorm = normalizeCode(body.code);
  if (codeNorm.length < 4) {
    return jsonError(400, "invalid_code");
  }

  const { data: league, error: leagueErr } = await adminClient
    .from("leagues")
    .select(
      "id, commissioner_profile_id, sponsorship_code_id, sponsorship_status",
    )
    .eq("id", body.league_id)
    .maybeSingle();
  if (leagueErr) {
    return jsonError(500, `League lookup failed: ${leagueErr.message}`);
  }
  if (!league) return jsonError(404, "League not found");
  if (league.commissioner_profile_id !== profileId) {
    return jsonError(403, "Only the commissioner can redeem a sponsorship code");
  }

  if (
    league.sponsorship_status === "redeemed_pending" ||
    league.sponsorship_status === "funded"
  ) {
    return jsonError(409, "league_already_has_sponsorship");
  }

  const now = new Date().toISOString();

  const { data: codeRow, error: codeLookupErr } = await adminClient
    .from("sponsorship_codes")
    .select(
      "id, code, status, expires_at, boost_max_cents, partner_name, redeemed_for_league_id",
    )
    .eq("code", codeNorm)
    .maybeSingle();

  if (codeLookupErr) {
    return jsonError(500, `Code lookup failed: ${codeLookupErr.message}`);
  }
  if (!codeRow) {
    return jsonError(404, "invalid_code");
  }
  if (codeRow.status !== "issued") {
    if (
      codeRow.redeemed_for_league_id === league.id &&
      codeRow.status === "redeemed"
    ) {
      return jsonError(409, "already_redeemed_for_this_league");
    }
    return jsonError(409, "already_redeemed");
  }
  if (codeRow.expires_at <= now) {
    return jsonError(409, "expired");
  }

  const { data: claimed, error: claimErr } = await adminClient
    .from("sponsorship_codes")
    .update({
      redeemed_for_league_id: league.id,
      redeemed_at: now,
      status: "redeemed",
    })
    .eq("id", codeRow.id)
    .eq("status", "issued")
    .select("id")
    .maybeSingle();

  if (claimErr) {
    return jsonError(500, `Claim failed: ${claimErr.message}`);
  }
  if (!claimed) {
    return jsonError(409, "already_redeemed");
  }

  const { error: leagueUpdErr } = await adminClient
    .from("leagues")
    .update({
      sponsorship_code_id: codeRow.id,
      sponsorship_boost_max_cents: codeRow.boost_max_cents,
      sponsorship_status: "redeemed_pending",
    })
    .eq("id", league.id);

  if (leagueUpdErr) {
    await adminClient
      .from("sponsorship_codes")
      .update({
        redeemed_for_league_id: null,
        redeemed_at: null,
        status: "issued",
      })
      .eq("id", codeRow.id);
    return jsonError(500, `League update failed: ${leagueUpdErr.message}`);
  }

  return jsonOk({
    ok: true,
    partner_name: codeRow.partner_name,
    boost_max_cents: codeRow.boost_max_cents,
    expires_at: codeRow.expires_at,
  });
});

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
