// Edge function: stripe-account-status
//
// Pulls the latest Stripe account state for the caller and mirrors it onto
// profiles.stripe_*. Used by the wallet screen to refresh after the user
// returns from the Stripe-hosted onboarding flow. Webhook-driven sync is
// deferred to the next slice — this function is the manual catch-up.
//
// Request:
//   POST /functions/v1/stripe-account-status
//   Authorization: Bearer <user JWT>
//   Body: {} (no params)
//
// Response:
//   200 {
//     account_id: string | null,
//     charges_enabled: boolean,
//     payouts_enabled: boolean,
//     details_submitted: boolean,
//     requirements: { currently_due: string[], past_due: string[],
//                     eventually_due: string[], disabled_reason: string|null },
//   }
//   4xx { error: string }
//
//   When the user has no stripe_account_id, returns the no-op shape with
//   account_id=null and all booleans false. Lets the client distinguish
//   "never started onboarding" from "started, in progress."

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@latest";

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

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-09-30.clover",
    httpClient: Stripe.createFetchHttpClient(),
  });

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

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    return jsonError(
      404,
      `Profile not found: ${profileError?.message ?? "unknown"}`,
    );
  }

  // No Stripe account yet — return a shape the client can trust without
  // hitting Stripe.
  if (!profile.stripe_account_id) {
    return new Response(
      JSON.stringify({
        account_id: null,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: null,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(profile.stripe_account_id);
  } catch (e) {
    // Most common case here is the platform deleted the connected account
    // out from under us (manual cleanup in dashboard, dev resets, etc).
    // Stripe surfaces this as `resource_missing`. Clear the orphaned id
    // and reset flags so the UI reflects "not started" instead of being
    // stuck on the last-known state.
    const isMissing =
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "resource_missing";

    if (isMissing) {
      await adminClient
        .from("profiles")
        .update({
          stripe_account_id: null,
          stripe_charges_enabled: false,
          stripe_payouts_enabled: false,
          stripe_details_submitted: false,
          stripe_requirements: null,
          stripe_account_updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      return new Response(
        JSON.stringify({
          account_id: null,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          requirements: {
            currently_due: [],
            past_due: [],
            eventually_due: [],
            disabled_reason: null,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const message = e instanceof Error ? e.message : String(e);
    return jsonError(502, `Stripe account retrieve failed: ${message}`);
  }

  const requirements = {
    currently_due: account.requirements?.currently_due ?? [],
    past_due: account.requirements?.past_due ?? [],
    eventually_due: account.requirements?.eventually_due ?? [],
    disabled_reason: account.requirements?.disabled_reason ?? null,
  };

  // Mirror onto profiles. Best-effort: if this update fails we still want
  // to return current state to the client.
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      stripe_charges_enabled: account.charges_enabled ?? false,
      stripe_payouts_enabled: account.payouts_enabled ?? false,
      stripe_details_submitted: account.details_submitted ?? false,
      stripe_requirements: requirements,
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (updateError) {
    console.warn(
      "[stripe-account-status] profile mirror failed:",
      updateError.message,
    );
  }

  return new Response(
    JSON.stringify({
      account_id: account.id,
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      requirements,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
