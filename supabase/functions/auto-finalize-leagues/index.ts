// Edge function: auto-finalize-leagues
//
// Sprint 4 Pass 2B Fix B. The safety-net cron that runs every 6h and walks
// the leagues table to:
//
//   1. Close any `open` authorization windows whose
//      `authorization_window_closes_at` is in the past. Pending votes are
//      flipped to `approved` (silence = consent — see migration
//      20260501000013) and `runPayoutForLeague` is invoked so funds release
//      autonomously even if no one ever votes. This is the "absent
//      commissioner" failsafe.
//
//   2. Open windows for leagues stuck in `not_started` despite having a
//      final snapshot already cached. This is a belt-and-suspenders catch
//      for any race where the auto-open inside `sync-league-standings`
//      no-ops (e.g. zero linked members at the time of sync).
//
// Idempotent: every action is guarded so the function is safe to invoke
// twice in a row. Returns a structured summary so we can wire it into a
// status page later.
//
// Auth: protected by a shared-secret header `X-Cron-Secret` matching the
// `CRON_SECRET` env var. We don't accept user JWTs because no caller is
// human — this is invoked by pg_cron via supabase_functions.http_request().
//
// Schedule (set in pg_cron migration):
//   select cron.schedule(
//     'potkeeper-auto-finalize',
//     '0 */6 * * *',
//     $$ select net.http_post(
//          url := '<func-url>',
//          headers := jsonb_build_object('X-Cron-Secret', current_setting('app.cron_secret'))
//        ) $$
//   );
//
// Spec: docs/TECH_SPEC.md §12 Sprint 4 Pass 2B + docs/APP_FLOW.md Flow 8.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";
import {
  AuthorizationError,
  openAuthorizationWindow,
} from "../shared/authorization.ts";
import { PayoutError, runPayoutForLeague } from "../shared/payout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CloseResult {
  league_id: string;
  flipped_pendings: number;
  payout?:
    | { status: "fired"; paid: number; waiting: number; failed: number; pending: number }
    | { status: "skipped"; reason: string };
}

interface OpenResult {
  league_id: string;
  status: "opened" | "skipped";
  reason?: string;
  pending_count?: number;
}

interface CronSummary {
  closed_windows: CloseResult[];
  opened_windows: OpenResult[];
  ran_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  // Auth: shared-secret header. pg_cron / external scheduler hits us with
  // X-Cron-Secret. We refuse on mismatch so this URL can't be triggered by
  // anonymous traffic even though it's deployed publicly.
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) {
    return jsonError(500, "CRON_SECRET not configured");
  }
  const provided = req.headers.get("X-Cron-Secret");
  if (provided !== secret) {
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

  const now = new Date().toISOString();
  const summary: CronSummary = {
    closed_windows: [],
    opened_windows: [],
    ran_at: now,
  };

  // -------------------------------------------------------------------------
  // 1. Close expired open windows + fire payouts.
  // -------------------------------------------------------------------------
  const { data: expired, error: expiredError } = await adminClient
    .from("leagues")
    .select("id, authorization_window_closes_at")
    .eq("authorization_status", "open")
    .lt("authorization_window_closes_at", now);

  if (expiredError) {
    console.error(
      `[auto-finalize-leagues] expired query failed: ${expiredError.message}`,
    );
    return jsonError(500, `Expired query failed: ${expiredError.message}`);
  }

  for (const league of expired ?? []) {
    const result = await closeExpiredWindow({
      adminClient,
      stripe,
      leagueId: league.id,
    });
    summary.closed_windows.push(result);
  }

  // -------------------------------------------------------------------------
  // 2. Re-open windows for leagues stuck in `not_started` despite having a
  //    final snapshot. Cheap query; in practice the set is near-empty
  //    because sync-league-standings already auto-opens on its own write.
  // -------------------------------------------------------------------------
  const { data: stuck, error: stuckError } = await adminClient
    .from("leagues")
    .select("id, status")
    .eq("authorization_status", "not_started");

  if (stuckError) {
    console.error(
      `[auto-finalize-leagues] stuck query failed: ${stuckError.message}`,
    );
  } else {
    for (const league of stuck ?? []) {
      // Only consider leagues with a `is_final` snapshot. Anything else is
      // mid-season and shouldn't be opened.
      const { data: finalSnap } = await adminClient
        .from("standings_snapshots")
        .select("id")
        .eq("league_id", league.id)
        .eq("is_final", true)
        .limit(1)
        .maybeSingle();
      if (!finalSnap) continue;

      try {
        const opened = await openAuthorizationWindow({
          adminClient,
          leagueId: league.id,
        });
        summary.opened_windows.push({
          league_id: league.id,
          status: "opened",
          pending_count: opened.pending_count,
        });
        console.log(
          `[auto-finalize-leagues] safety-net opened window for league=${league.id} pending=${opened.pending_count}`,
        );
      } catch (e) {
        const reason = e instanceof AuthorizationError ? e.code : "internal_error";
        summary.opened_windows.push({
          league_id: league.id,
          status: "skipped",
          reason,
        });
        if (reason !== "already_started" && reason !== "no_linked_members") {
          console.error(
            `[auto-finalize-leagues] safety-net open failed for league=${league.id} reason=${reason}`,
          );
        }
      }
    }
  }

  return jsonOk(summary);
});

// ============================================================================
// Close path
// ============================================================================

async function closeExpiredWindow(args: {
  adminClient: ReturnType<typeof createClient>;
  stripe: Stripe;
  leagueId: string;
}): Promise<CloseResult> {
  const { adminClient, stripe, leagueId } = args;

  // Re-read inside the loop body — between the SELECT above and now, a
  // last-second submit-authorization-vote could have already closed the
  // window. We avoid double-firing by checking the current status.
  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select("id, authorization_status")
    .eq("id", leagueId)
    .maybeSingle();
  if (leagueError || !league) {
    console.error(
      `[auto-finalize-leagues] re-read failed for league=${leagueId} err=${leagueError?.message}`,
    );
    return { league_id: leagueId, flipped_pendings: 0 };
  }
  if (league.authorization_status !== "open") {
    return { league_id: leagueId, flipped_pendings: 0 };
  }

  // Flip any remaining `pending` votes to `approved`. Silence = consent;
  // see migration 20260501000013 + docs/APP_FLOW.md Flow 8.
  const { data: flipped, error: flipError } = await adminClient
    .from("standings_authorizations")
    .update({ status: "approved", voted_at: new Date().toISOString() })
    .eq("league_id", leagueId)
    .eq("status", "pending")
    .select("id");
  if (flipError) {
    console.error(
      `[auto-finalize-leagues] flip failed for league=${leagueId} err=${flipError.message}`,
    );
    return { league_id: leagueId, flipped_pendings: 0 };
  }
  const flippedCount = flipped?.length ?? 0;

  // If anyone disputed, the league should already be `closed_disputed` and
  // we wouldn't have selected it. But double-check no `disputed` row slipped
  // in — if so, flip status to closed_disputed and skip payout.
  const { data: disputes } = await adminClient
    .from("standings_authorizations")
    .select("id")
    .eq("league_id", leagueId)
    .eq("status", "disputed")
    .limit(1);
  const hasDispute = (disputes?.length ?? 0) > 0;

  const closedAt = new Date().toISOString();
  const nextStatus = hasDispute ? "closed_disputed" : "closed_authorized";

  const { error: leagueUpdateError } = await adminClient
    .from("leagues")
    .update({
      authorization_status: nextStatus,
      authorization_auto_finalized_at: closedAt,
    })
    .eq("id", leagueId)
    .eq("authorization_status", "open"); // optimistic concurrency
  if (leagueUpdateError) {
    console.error(
      `[auto-finalize-leagues] league close failed for league=${leagueId} err=${leagueUpdateError.message}`,
    );
    return { league_id: leagueId, flipped_pendings: flippedCount };
  }

  console.log(
    `[auto-finalize-leagues] auto-finalized league=${leagueId} flipped=${flippedCount} status=${nextStatus}`,
  );

  if (nextStatus === "closed_disputed") {
    return {
      league_id: leagueId,
      flipped_pendings: flippedCount,
      payout: { status: "skipped", reason: "dispute" },
    };
  }

  // Auto-fire payouts. `initiated_by: null` flags system-fired in pot_ledger
  // / payouts so support can tell cron-fired from human-fired.
  try {
    const result = await runPayoutForLeague({
      adminClient,
      stripe,
      leagueId,
      initiatedBy: null,
    });
    const counts = countByStatus(result.payouts);
    return {
      league_id: leagueId,
      flipped_pendings: flippedCount,
      payout: {
        status: "fired",
        paid: counts.paid,
        waiting: counts.waiting_on_connect,
        failed: counts.failed,
        pending: counts.pending,
      },
    };
  } catch (e) {
    const reason = e instanceof PayoutError ? e.code : "internal_error";
    console.error(
      `[auto-finalize-leagues] payout failed for league=${leagueId} reason=${reason}`,
    );
    return {
      league_id: leagueId,
      flipped_pendings: flippedCount,
      payout: { status: "skipped", reason },
    };
  }
}

function countByStatus(rows: { status: string }[]): {
  paid: number;
  waiting_on_connect: number;
  failed: number;
  pending: number;
} {
  const counts = { paid: 0, waiting_on_connect: 0, failed: 0, pending: 0 };
  for (const r of rows) {
    if (r.status === "paid") counts.paid++;
    else if (r.status === "waiting_on_connect") counts.waiting_on_connect++;
    else if (r.status === "failed") counts.failed++;
    else if (r.status === "pending" || r.status === "processing") counts.pending++;
  }
  return counts;
}

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
