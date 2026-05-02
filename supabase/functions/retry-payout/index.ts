// Edge function: retry-payout
//
// Sprint 4 Pass 2B Fix C. Re-fires payouts that landed in `waiting_on_connect`
// or `failed` after the original disbursement. The common case: a winner
// hadn't onboarded Stripe Connect when the cron / auto-fire ran, so their
// row stalled. Once they finish onboarding, this endpoint releases their
// money without forcing the commissioner to chase Stripe support.
//
// Auth modes:
//   - Commissioner (any caller where leagues.commissioner_profile_id =
//     auth.uid()): retries every pending row for the league.
//   - Recipient self-serve (any caller who owns the specific payout row):
//     retries just their own row. Required body field: `payout_id`.
//
// Request:
//   POST /functions/v1/retry-payout
//   Authorization: Bearer <user JWT>
//   Body: { league_id: uuid, payout_id?: number }
//
// Response:
//   200 { league_id, retried: PayoutResultRow[], skipped: SkippedRow[] }
//   4xx { error: string }
//
// Spec: docs/TECH_SPEC.md §12 Sprint 4 Pass 2B + docs/APP_FLOW.md Flow 9.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";
import {
  PayoutError,
  retryPayoutsForLeague,
} from "../shared/payout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  league_id: string;
  payout_id?: number;
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
  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey || !stripeSecret) {
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
    return jsonError(401, `Invalid auth token: ${userError?.message ?? "unknown"}`);
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

  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select("id, commissioner_profile_id, authorization_status")
    .eq("id", body.league_id)
    .maybeSingle();
  if (leagueError) {
    return jsonError(500, `League lookup failed: ${leagueError.message}`);
  }
  if (!league) return jsonError(404, "League not found");

  // Authorization: commissioner OR the recipient themselves.
  const isCommissioner = league.commissioner_profile_id === profileId;
  if (!isCommissioner && body.payout_id == null) {
    return jsonError(
      403,
      "Only the commissioner can retry all payouts. Pass `payout_id` to retry only your own.",
    );
  }
  if (!isCommissioner && body.payout_id != null) {
    // Verify the caller owns this payout row before letting them touch it.
    const { data: payout, error: payoutError } = await adminClient
      .from("payouts")
      .select("id, profile_id, league_id")
      .eq("id", body.payout_id)
      .maybeSingle();
    if (payoutError) {
      return jsonError(500, `Payout lookup failed: ${payoutError.message}`);
    }
    if (!payout || payout.league_id !== body.league_id) {
      return jsonError(404, "Payout not found");
    }
    if (payout.profile_id !== profileId) {
      return jsonError(
        403,
        "You can only retry your own payout (or be the league commissioner).",
      );
    }
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2025-04-30.basil",
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const result = await retryPayoutsForLeague({
      adminClient,
      stripe,
      leagueId: body.league_id,
      initiatedBy: profileId,
      payoutId: body.payout_id,
    });
    return jsonOk({
      league_id: body.league_id,
      retried: result.retried,
      skipped: result.skipped,
    });
  } catch (e) {
    if (e instanceof PayoutError) {
      const status = e.code === "league_not_found"
        ? 404
        : e.code === "not_authorized"
          ? 409
          : 500;
      return jsonError(status, e.message);
    }
    return jsonError(
      500,
      `Retry failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
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
