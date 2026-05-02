// Edge function: stripe-create-buy-in-session
//
// Creates a Stripe Checkout Session for a member's buy-in into a specific
// league. The session is the on-ramp: Stripe collects card + billing
// address, then their server fires `checkout.session.completed` to our
// stripe-webhook function which writes the pot_ledger row.
//
// Defense in depth — mirrors the Pre-flight checks the UI does plus a few
// the UI can't (RLS-bypassing service role lookups).
//
// Request:
//   POST /functions/v1/stripe-create-buy-in-session
//   Authorization: Bearer <user JWT>
//   Body: { league_id: uuid }
//
// Response:
//   200 { checkout_url, session_id }
//   4xx { error: string }
//
// Notes on fee handling (Pass 1 simplification):
//   We charge `league.buy_in_cents` exactly. Stripe's per-transaction fee
//   (~2.9% + $0.30) comes out of *our* platform balance — i.e. the
//   commissioner's pot still credits the full advertised buy-in. In Pass 2
//   we'll either pass that through to the member as a separate line item
//   or split it via Connect application_fee_amount, depending on what the
//   commissioner picked in `leagues.fee_payer`. Spec coverage:
//   docs/TECH_SPEC.md §10.1 "Money flow."

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@latest";

// Same Vercel-hosted bridge as the Connect onboarding flow. The page
// just bounces to potkeeper://buy-in-return?... so
// expo-web-browser.openAuthSessionAsync auto-dismisses.
const SUCCESS_URL_BASE = "https://potkeeper.app/buy-in-return";
const CANCEL_URL_BASE = "https://potkeeper.app/buy-in-return?cancelled=1";

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
    return jsonError(
      500,
      "Edge function not configured (missing SUPABASE_* or STRIPE_SECRET_KEY)",
    );
  }

  let body: { league_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const leagueId = body.league_id;
  if (!leagueId || typeof leagueId !== "string") {
    return jsonError(400, "Missing required field: league_id (uuid)");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-09-30.clover",
    httpClient: Stripe.createFetchHttpClient(),
  });

  // 1. Resolve caller.
  const { data: userData, error: userError } = await adminClient.auth.getUser(
    jwt,
  );
  if (userError || !userData.user) {
    return jsonError(
      401,
      `Invalid auth token: ${userError?.message ?? "unknown"}`,
    );
  }
  const userId = userData.user.id;
  const userEmail = userData.user.email ?? undefined;

  // 2. Eligibility pre-flight. Must be at least signup-cleared. Restricted
  //    or pending users get a hard 403 — Checkpoint 1 should have caught
  //    them already, but a stale client could slip through.
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, geo_status, location_state")
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    return jsonError(
      404,
      `Profile not found: ${profileError?.message ?? "unknown"}`,
    );
  }
  if (profile.geo_status !== "declared" && profile.geo_status !== "verified") {
    return jsonError(
      403,
      `Eligibility not cleared (geo_status=${profile.geo_status})`,
    );
  }

  // 3. Load league + member row + verify caller is a member of this league.
  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select("id, name, buy_in_cents, buyin_configured_at, fee_payer")
    .eq("id", leagueId)
    .single();
  if (leagueError || !league) {
    return jsonError(404, `League not found: ${leagueError?.message ?? leagueId}`);
  }
  if (league.buy_in_cents == null || league.buyin_configured_at == null) {
    return jsonError(
      409,
      "League buy-in not configured yet. The commissioner needs to set it up first.",
    );
  }
  if (league.buy_in_cents <= 0) {
    return jsonError(409, "League buy-in must be greater than $0");
  }

  const { data: member, error: memberError } = await adminClient
    .from("league_members")
    .select("id, league_id, payment_status, linked_profile_id, team_name, external_username")
    .eq("league_id", leagueId)
    .eq("linked_profile_id", userId)
    .maybeSingle();
  if (memberError) {
    return jsonError(500, `Member lookup failed: ${memberError.message}`);
  }
  if (!member) {
    // The user is on PotKeeper but isn't claimed against any roster in this
    // league. v1 doesn't support paid join-requests, so this is a hard
    // stop — they need to be linked first (Sleeper import does this
    // automatically for the importer; for everyone else, that flow ships
    // in Pass 2 alongside join_requests).
    return jsonError(
      403,
      "You're not a member of this league. Ask the commissioner to invite you.",
    );
  }
  if (member.payment_status === "paid") {
    return jsonError(409, "You've already paid your buy-in for this league.");
  }

  // 4. Create the Checkout Session. Pass 1: charge buy_in_cents flat.
  //    Metadata is the truthful source for the webhook; we set it both on
  //    the session and on the underlying payment_intent so either event
  //    we listen to has it.
  const memberDisplay =
    member.team_name ?? member.external_username ?? "Member";
  const metadata: Record<string, string> = {
    potkeeper_kind: "buy_in",
    league_id: league.id,
    league_name: league.name,
    league_member_id: member.id,
    profile_id: userId,
    buy_in_cents: String(league.buy_in_cents),
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Stripe rejects custom mobile schemes. Land on the Vercel page,
      // which immediately redirects to potkeeper://buy-in-return so
      // openAuthSessionAsync auto-dismisses.
      success_url: `${SUCCESS_URL_BASE}?session_id={CHECKOUT_SESSION_ID}&league=${league.id}`,
      cancel_url: `${CANCEL_URL_BASE}&league=${league.id}`,
      customer_email: userEmail,
      // Forces Stripe to capture the cardholder's billing state, which we
      // need for the Checkpoint 2/3 reconciliation in the webhook.
      billing_address_collection: "required",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: league.buy_in_cents,
            product_data: {
              name: `${league.name} — buy-in`,
              description: `Entry into ${league.name} on PotKeeper. Held in escrow until season standings finalize.`,
            },
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: {
        metadata,
        // Statement descriptor on the cardholder's bank statement. Keep
        // it short — Stripe truncates anything over 22 chars and rejects
        // some special characters. "POTKEEPER LEAGUE" leaves room for
        // their bank's prefix.
        statement_descriptor_suffix: "LEAGUE BUY-IN",
        // 7-day idempotency window: if Stripe replays the event we'll
        // catch it via stripe_event_id UNIQUE in pot_ledger.
        description: `${league.name} buy-in for ${memberDisplay}`,
      },
      // Restrict to allow_promotion_codes=false so test users don't try
      // weird coupon flows. Sponsorship codes ship in Phase 0.75.
      allow_promotion_codes: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(502, `Stripe Checkout session create failed: ${message}`);
  }

  if (!session.url) {
    return jsonError(502, "Stripe returned a session without a URL");
  }

  return new Response(
    JSON.stringify({
      checkout_url: session.url,
      session_id: session.id,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
