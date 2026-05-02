// Edge function: release-reserves
//
// Pass 2C. Daily (or periodic) cron releases `payouts` rows where
// `payout_slice = 'reserve'`, `status` in (reserved, waiting_on_connect,
// failed), and `scheduled_for <= now()`, by creating Stripe transfers and
// appending `pot_ledger` `reserve_released` rows. Skips leagues with
// `buyin_dispute_open_count > 0` (D4.a).
//
// Auth: `X-Cron-Secret` must match `CRON_SECRET` (same pattern as
// `auto-finalize-leagues`).
//
// Schedule (pg_cron example — set URL + secret in your project):
//   select cron.schedule(
//     'potkeeper-release-reserves',
//     '15 2 * * *',
//     $$ select net.http_post(
//          url := '<project-ref>.supabase.co/functions/v1/release-reserves',
//          headers := jsonb_build_object(
//            'Content-Type', 'application/json',
//            'X-Cron-Secret', current_setting('app.cron_secret')
//          ),
//          body := '{}'::jsonb
//        ) $$
//   );
//
// Spec: docs/TECH_SPEC.md §12 Pass 2C.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";
import { PayoutError, releaseDueReservePayouts } from "../shared/payout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) {
    return jsonError(500, "CRON_SECRET not configured");
  }
  if (req.headers.get("X-Cron-Secret") !== secret) {
    return jsonError(401, "Invalid cron secret");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey || !stripeSecret) {
    return jsonError(500, "Edge function not configured (missing env vars)");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2025-04-30.basil",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const ranAt = new Date().toISOString();
  try {
    const summary = await releaseDueReservePayouts({
      adminClient,
      stripe,
      limit: 100,
    });
    return jsonOk({ ...summary, ran_at: ranAt });
  } catch (e) {
    const message = e instanceof PayoutError ? e.message : "internal_error";
    console.error("[release-reserves]", e);
    return jsonError(500, message);
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
