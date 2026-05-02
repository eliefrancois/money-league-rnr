// Edge function: submit-authorization-vote
//
// Sprint 4 Pass 1. Records a single member's vote on the standings
// authorization window (APP_FLOW Screen 8.2).
//
// Pre-conditions (validated server-side, not just trusted from the client):
//   - League's authorization_status === 'open'
//   - Window not yet expired (closes_at > now)
//   - Caller is a linked member of the league
//   - There is a pending standings_authorizations row for (snapshot, member)
//
// On approve: row goes 'approved' with voted_at=now. If every row for this
//   snapshot is now non-pending and ALL are approved, flip league to
//   'closed_authorized'.
// On dispute: row goes 'disputed' with dispute_reason. Flip league to
//   'closed_disputed' immediately — Pass 1 freezes the league at first
//   dispute, full resolution UI is Pass 2.
//
// Request:
//   POST /functions/v1/submit-authorization-vote
//   Authorization: Bearer <user JWT>
//   Body: {
//     league_id: uuid,
//     decision: 'approved' | 'disputed',
//     reason?: string  // required (and trimmed) when decision='disputed'
//   }
//
// Response:
//   200 {
//     authorization: AuthorizationRow,
//     league_status: 'open' | 'closed_authorized' | 'closed_disputed',
//     progress: { approved: number; disputed: number; pending: number; total: number }
//   }
//   4xx { error: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@latest";

import {
  PayoutError,
  type PayoutResult,
  runPayoutForLeague,
} from "../shared/payout.ts";

const MAX_REASON_LEN = 1_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  league_id: string;
  decision: "approved" | "disputed";
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  // 1. Auth
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

  // 2. Parse + validate body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError(400, "Body must be valid JSON");
  }
  if (!body.league_id || typeof body.league_id !== "string") {
    return jsonError(400, "league_id is required");
  }
  if (body.decision !== "approved" && body.decision !== "disputed") {
    return jsonError(400, "decision must be 'approved' or 'disputed'");
  }

  let trimmedReason: string | null = null;
  if (body.decision === "disputed") {
    const raw = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!raw) {
      return jsonError(
        400,
        "reason is required when disputing the standings",
      );
    }
    if (raw.length > MAX_REASON_LEN) {
      return jsonError(400, `reason must be ${MAX_REASON_LEN} chars or less`);
    }
    trimmedReason = raw;
  }

  // 3. Load league. State machine guard runs server-side so a stale UI can't
  //    push votes into a closed window.
  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select(
      "id, authorization_status, authorization_window_closes_at",
    )
    .eq("id", body.league_id)
    .maybeSingle();
  if (leagueError) {
    return jsonError(500, `League lookup failed: ${leagueError.message}`);
  }
  if (!league) {
    return jsonError(404, "League not found");
  }
  if (league.authorization_status !== "open") {
    return jsonError(
      409,
      `Authorization window is ${league.authorization_status}, not open`,
    );
  }
  if (
    league.authorization_window_closes_at &&
    new Date(league.authorization_window_closes_at).getTime() < Date.now()
  ) {
    // Window has expired but not yet been auto-closed (Pass 2 cron). Reject
    // the vote rather than silently accept it.
    return jsonError(409, "Authorization window has expired");
  }

  // 4. Resolve caller's league_member row.
  const { data: membership, error: membershipError } = await adminClient
    .from("league_members")
    .select("id")
    .eq("league_id", league.id)
    .eq("linked_profile_id", profileId)
    .maybeSingle();
  if (membershipError) {
    return jsonError(
      500,
      `Membership lookup failed: ${membershipError.message}`,
    );
  }
  if (!membership) {
    return jsonError(403, "You are not a linked member of this league");
  }

  // 5. Find caller's pending authorization row. There must be exactly one
  //    (start-authorization-window seeds them); if not, we treat this as an
  //    "out of band" state and surface a 409 rather than create one.
  const { data: pendingRow, error: pendingError } = await adminClient
    .from("standings_authorizations")
    .select("*")
    .eq("league_id", league.id)
    .eq("league_member_id", membership.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pendingError) {
    return jsonError(
      500,
      `Authorization row lookup failed: ${pendingError.message}`,
    );
  }
  if (!pendingRow) {
    // Most likely the user already voted; report that explicitly.
    return jsonError(
      409,
      "No pending authorization for you on this snapshot — you may have already voted.",
    );
  }

  // 6. Update the row.
  const updatePatch =
    body.decision === "approved"
      ? {
          status: "approved" as const,
          voted_at: new Date().toISOString(),
          dispute_reason: null,
        }
      : {
          status: "disputed" as const,
          voted_at: new Date().toISOString(),
          dispute_reason: trimmedReason,
        };

  const { data: updatedAuth, error: updateError } = await adminClient
    .from("standings_authorizations")
    .update(updatePatch)
    .eq("id", pendingRow.id)
    .select()
    .single();
  if (updateError || !updatedAuth) {
    return jsonError(
      500,
      `Failed to record vote: ${updateError?.message ?? "unknown"}`,
    );
  }

  // 7. Recompute progress for the same snapshot, then advance league state.
  const { data: allForSnapshot, error: progressError } = await adminClient
    .from("standings_authorizations")
    .select("status")
    .eq("league_id", league.id)
    .eq("snapshot_id", pendingRow.snapshot_id);
  if (progressError) {
    return jsonError(
      500,
      `Progress lookup failed: ${progressError.message}`,
    );
  }
  const progress = countStatuses(allForSnapshot ?? []);

  let nextStatus: "open" | "closed_authorized" | "closed_disputed" = "open";
  if (progress.disputed > 0) {
    nextStatus = "closed_disputed";
  } else if (progress.pending === 0 && progress.approved === progress.total) {
    nextStatus = "closed_authorized";
  }

  if (nextStatus !== "open") {
    const { error: closeError } = await adminClient
      .from("leagues")
      .update({ authorization_status: nextStatus })
      .eq("id", league.id);
    if (closeError) {
      // Non-fatal — the vote landed; surface the close failure for ops
      // follow-up. Re-running the flow next time will retry the close.
      console.warn(
        `[submit-authorization-vote] failed to close league ${league.id}: ${closeError.message}`,
      );
    }
  }

  // Auto-fire payouts the moment the league transitions to closed_authorized.
  // This is the "no commissioner needed" trust pitch — the pot disburses
  // itself when the league has consensus. Failures here are non-fatal:
  // - PayoutError("already_triggered") is impossible on a fresh transition
  //   but harmless if it occurs (e.g. concurrent vote race).
  // - Stripe API errors are recorded against individual payouts rows; the
  //   commissioner can hit "Send the pot" as a manual retry.
  // - Unexpected errors are logged but don't fail the vote response.
  let payoutsSummary: PayoutResult | null = null;
  let payoutError: string | null = null;
  if (nextStatus === "closed_authorized") {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error(
        "[submit-authorization-vote] STRIPE_SECRET_KEY not set — auto-fire skipped",
      );
      payoutError = "Payout configuration missing — commissioner can retry manually.";
    } else {
      const stripe = new Stripe(stripeKey, {
        apiVersion: "2025-09-30.clover",
        httpClient: Stripe.createFetchHttpClient(),
      });
      try {
        payoutsSummary = await runPayoutForLeague({
          adminClient,
          stripe,
          leagueId: league.id,
          initiatedBy: null, // system auto-fire; no human pressed a button
        });
        console.log(
          `[submit-authorization-vote] auto-fired payouts for ${league.id}:`,
          JSON.stringify({
            paid: payoutsSummary.payouts.filter((p) => p.status === "paid").length,
            waiting: payoutsSummary.payouts.filter((p) => p.status === "waiting_on_connect").length,
            failed: payoutsSummary.payouts.filter((p) => p.status === "failed").length,
          }),
        );
      } catch (e) {
        if (e instanceof PayoutError) {
          if (e.code === "already_triggered") {
            // Race / replay — engine is idempotent, move on quietly.
            console.log(
              `[submit-authorization-vote] payouts already triggered for ${league.id}; skipping auto-fire`,
            );
          } else {
            console.error(
              `[submit-authorization-vote] auto-fire failed (${e.code}): ${e.message}`,
            );
            payoutError = e.message;
          }
        } else {
          const message = e instanceof Error ? e.message : String(e);
          console.error(
            `[submit-authorization-vote] auto-fire crashed: ${message}`,
          );
          payoutError = message;
        }
      }
    }
  }

  return jsonOk({
    authorization: updatedAuth,
    league_status: nextStatus,
    progress,
    payouts_summary: payoutsSummary,
    payout_error: payoutError,
  });
});

// ============================================================================
// Helpers
// ============================================================================

function countStatuses(rows: Array<{ status: string }>): {
  approved: number;
  disputed: number;
  pending: number;
  total: number;
} {
  let approved = 0;
  let disputed = 0;
  let pending = 0;
  for (const r of rows) {
    if (r.status === "approved") approved++;
    else if (r.status === "disputed") disputed++;
    else pending++;
  }
  return { approved, disputed, pending, total: rows.length };
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
