// Edge function: stripe-create-connect-account
//
// Idempotent: if the caller already has profiles.stripe_account_id we reuse
// it, otherwise we mint a new Connect account. Either way we always return
// a freshly-minted AccountLink (those expire ~5 min after creation, so they
// must be created on demand).
//
// Account model — Connect "Express-equivalent" via controller properties
// (post-2025 API; type='express' is deprecated in favor of explicit
// controller flags). See Stripe docs:
// https://docs.stripe.com/connect/migrate-to-controller-properties
//
//   controller.stripe_dashboard.type = 'express'   → Stripe-hosted dashboard
//   controller.fees.payer = 'application'          → PotKeeper pays Stripe fees
//   controller.losses.payments = 'application'     → PotKeeper covers negative balances
//   controller.requirement_collection = 'stripe'   → Stripe collects KYC (default)
//   capabilities.transfers = requested             → can receive transfers from
//                                                    PotKeeper's platform balance
//
// We deliberately do NOT request `card_payments` capability — connected
// accounts don't take charges directly (separate-charges-and-transfers
// model: members pay PotKeeper, PotKeeper transfers to winners).
//
// Request:
//   POST /functions/v1/stripe-create-connect-account
//   Authorization: Bearer <user JWT>
//   Body: {} (no params; everything inferred from caller's profile)
//
// Response:
//   200 { account_id, onboarding_url, expires_at }
//   4xx { error: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@latest";

// Both URLs must be https — Stripe rejects custom mobile schemes. We
// land at potkeeper.app/stripe-return (hosted on Vercel from the
// potkeeper-site repo), which immediately bounces to potkeeper://
// stripe-return so expo-web-browser.openAuthSessionAsync auto-dismisses.
// HTML fallback exists for users hitting the URL outside the app (e.g.
// from a desktop or without the app installed).
const STRIPE_RETURN_URL = "https://potkeeper.app/stripe-return";
const STRIPE_REFRESH_URL = "https://potkeeper.app/stripe-return?refresh=1";

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
    // Keep this aligned with what the dashboard reports as "Latest" so the
    // shape of returned objects is predictable.
    apiVersion: "2025-09-30.clover",
    httpClient: Stripe.createFetchHttpClient(),
  });

  // 1. Validate JWT and load the caller's profile.
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

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select(
      "id, geo_status, location_state, stripe_account_id, full_name",
    )
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    return jsonError(
      404,
      `Profile not found: ${profileError?.message ?? "unknown"}`,
    );
  }

  // 2. Pre-flight: must be eligibility-cleared. Defense in depth — the UI
  //    shouldn't render the CTA in pending/suspended state, but we don't
  //    trust the UI.
  if (profile.geo_status !== "declared" && profile.geo_status !== "verified") {
    return jsonError(
      403,
      `Eligibility not cleared (geo_status=${profile.geo_status})`,
    );
  }

  // 3. Idempotent account creation.
  let accountId = profile.stripe_account_id;
  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        country: "US",
        email: userEmail,
        controller: {
          stripe_dashboard: { type: "express" },
          fees: { payer: "application" },
          losses: { payments: "application" },
        },
        capabilities: {
          transfers: { requested: true },
        },
        business_type: "individual",
        // Pre-fill business_profile so Stripe doesn't ask the user for a
        // website or product description during onboarding. PotKeeper
        // users aren't merchants — they're individuals receiving
        // payouts of fantasy league pots. We classify them under MCC
        // 7997 (Membership Clubs - Sports/Recreation/Athletic) which
        // is the closest fit and avoids tripping the gambling flags
        // that 7995 (Betting/Casino) would.
        business_profile: {
          mcc: "7997",
          url: "https://potkeeper.app",
          product_description:
            "Receives automated disbursements of fantasy sports league winnings via the PotKeeper platform. The recipient does not sell goods or services.",
        },
        // Pre-fill what we already know from the eligibility gate. Stripe
        // ignores unknown fields gracefully, so this is best-effort.
        individual: profile.full_name
          ? { email: userEmail }
          : undefined,
        metadata: {
          potkeeper_profile_id: userId,
          potkeeper_location_state: profile.location_state ?? "",
        },
      });
      accountId = account.id;

      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("id", userId);
      if (updateError) {
        // Best-effort: the account exists in Stripe at this point. We
        // can't roll back the Stripe-side creation, so return an error
        // and the next call will see the existing acct via Stripe
        // search-by-metadata fallback (TODO).
        return jsonError(
          500,
          `Account created in Stripe (${accountId}) but profile update failed: ${updateError.message}. Contact support.`,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(502, `Stripe account create failed: ${message}`);
    }
  }

  // 4. Mint a fresh AccountLink for onboarding. Always create a new one —
  //    they expire after a few minutes and aren't reusable.
  let link;
  try {
    link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: STRIPE_RETURN_URL,
      refresh_url: STRIPE_REFRESH_URL,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(502, `Stripe AccountLink create failed: ${message}`);
  }

  return new Response(
    JSON.stringify({
      account_id: accountId,
      onboarding_url: link.url,
      expires_at: link.expires_at,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
