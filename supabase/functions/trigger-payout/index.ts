// Edge function: trigger-payout
//
// Manual commissioner-triggered payout. Sprint 4 Pass 2A shipped this as the
// primary path; Pass 2B turns the same primitives into the auto-fire flow
// from `submit-authorization-vote`. This function still exists as the
// commissioner's safety valve / retry button — if auto-fire ever fails
// catastrophically, the commissioner can hit "Send the pot" to re-run the
// engine.
//
// All the actual work lives in shared/payout.ts so both code paths share
// idempotency, fee math, and Stripe transfer logic. This function is just
// the JWT + commissioner gate.
//
// Request:
//   POST /functions/v1/trigger-payout
//   Authorization: Bearer <user JWT (commissioner)>
//   Body: { league_id: uuid }
//
// Response:
//   200 PayoutResult (see shared/payout.ts)
//   4xx { error: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@latest";

import { PayoutError, runPayoutForLeague } from "../shared/payout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RequestBody {
  league_id: string;
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
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey || !stripeKey) {
    return jsonError(500, "Edge function not configured (missing env vars)");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-09-30.clover",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
  if (userError || !userData.user) {
    return jsonError(401, `Invalid auth token: ${userError?.message ?? "unknown"}`);
  }
  const callerProfileId = userData.user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError(400, "Body must be valid JSON");
  }
  if (!body.league_id || typeof body.league_id !== "string") {
    return jsonError(400, "league_id (uuid) is required");
  }

  // Commissioner-only gate. The shared engine doesn't enforce this so that
  // auto-fire (called by any approving member) can still run.
  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select("commissioner_profile_id")
    .eq("id", body.league_id)
    .maybeSingle();
  if (leagueError) return jsonError(500, `League lookup failed: ${leagueError.message}`);
  if (!league) return jsonError(404, "League not found");
  if (league.commissioner_profile_id !== callerProfileId) {
    return jsonError(403, "Only the commissioner can trigger payouts");
  }

  try {
    const result = await runPayoutForLeague({
      adminClient,
      stripe,
      leagueId: body.league_id,
      initiatedBy: callerProfileId,
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof PayoutError) {
      // Map engine error codes to HTTP statuses so the client can render
      // the right copy.
      const status = (() => {
        switch (e.code) {
          case "league_not_found":
            return 404;
          case "not_authorized":
          case "no_final_snapshot":
          case "already_triggered":
          case "no_funds":
          case "no_split_configured":
          case "invalid_split":
          case "missing_standings_row":
            return 409;
          default:
            return 500;
        }
      })();
      return jsonError(status, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("[trigger-payout] unexpected error:", message);
    return jsonError(500, message);
  }
});
