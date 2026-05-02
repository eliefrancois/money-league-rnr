// Edge function: sponsorship-boost-tick
//
// Pass 2C. Daily cron evaluates leagues in `sponsorship_status = 'redeemed_pending'`.
// When `sponsorship_codes.conditions` thresholds are met, credits the pot via
// `pot_ledger` `sponsorship_credit` and flips league + code to `funded`.
// After `expires_at`, marks `forfeited` if still pending.
//
// Auth: `X-Cron-Secret` === `CRON_SECRET` (same as `release-reserves`).
//
// Spec: docs/TECH_SPEC.md §3.11

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  computeSponsorshipBoostCents,
  parseSponsorshipConditions,
} from "../shared/sponsorship.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TickSummary {
  ran_at: string;
  funded: number;
  forfeited: number;
  skipped: number;
}

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
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError(500, "Edge function not configured (missing env vars)");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const summary: TickSummary = {
    ran_at: new Date().toISOString(),
    funded: 0,
    forfeited: 0,
    skipped: 0,
  };

  const { data: leagues, error: leagueErr } = await adminClient
    .from("leagues")
    .select(
      "id, name, season, buy_in_cents, buyin_configured_at, payout_split, sponsorship_code_id, sponsorship_status, sponsorship_boost_max_cents",
    )
    .eq("sponsorship_status", "redeemed_pending")
    .limit(200);

  if (leagueErr) {
    console.error("[sponsorship-boost-tick] league query:", leagueErr.message);
    return jsonError(500, leagueErr.message);
  }

  for (const league of leagues ?? []) {
    const codeId = league.sponsorship_code_id;
    if (codeId == null) {
      summary.skipped++;
      continue;
    }

    const { data: code, error: codeErr } = await adminClient
      .from("sponsorship_codes")
      .select(
        "id, code, status, conditions, expires_at, boost_max_cents, match_ratio, partner_contact_email",
      )
      .eq("id", codeId)
      .maybeSingle();

    if (codeErr || !code) {
      console.error(
        `[sponsorship-boost-tick] missing code ${codeId} for league ${league.id}`,
      );
      summary.skipped++;
      continue;
    }

    const nowIso = new Date().toISOString();
    const conditions = parseSponsorshipConditions(code.conditions);

    if (code.expires_at <= nowIso || code.status === "cancelled") {
      await forfeitLeague(adminClient, league.id, code.id);
      summary.forfeited++;
      continue;
    }

    if (conditions.season != null) {
      const y = parseInt(String(league.season).trim(), 10);
      if (!Number.isFinite(y) || y !== conditions.season) {
        summary.skipped++;
        continue;
      }
    }

    if (
      league.buy_in_cents == null ||
      league.buy_in_cents < conditions.min_buy_in_cents
    ) {
      summary.skipped++;
      continue;
    }

    if (conditions.must_use_auto_payout && league.buyin_configured_at == null) {
      summary.skipped++;
      continue;
    }

    // Denominator must mirror what the UI shows on League Detail "Payments x/y"
    // (app/(app)/league/[id]/index.tsx → visibleMembers): only linked or
    // owner members can actually pay, so unlinked Sleeper rosters can't be
    // counted against the threshold or the bar would never reach 80%.
    const { count: memberCount, error: mcErr } = await adminClient
      .from("league_members")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .or("linked_profile_id.not.is.null,is_owner.eq.true");

    if (mcErr || !memberCount || memberCount <= 0) {
      summary.skipped++;
      continue;
    }

    const { count: paidCount, error: pcErr } = await adminClient
      .from("league_members")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("payment_status", "paid")
      .or("linked_profile_id.not.is.null,is_owner.eq.true");

    if (pcErr) {
      summary.skipped++;
      continue;
    }

    const paid = paidCount ?? 0;
    const pct = paid / memberCount;
    if (pct + 1e-9 < conditions.min_members_paid_pct) {
      summary.skipped++;
      continue;
    }

    const { data: ledgerRows, error: ledErr } = await adminClient
      .from("pot_ledger")
      .select("amount_cents, type")
      .eq("league_id", league.id);
    if (ledErr) {
      summary.skipped++;
      continue;
    }

    let memberPot = 0;
    for (const row of ledgerRows ?? []) {
      if (row.type === "buy_in_paid") {
        memberPot += row.amount_cents;
      }
    }

    const matchRatio = Number(code.match_ratio);
    const boost = computeSponsorshipBoostCents({
      memberPotCents: memberPot,
      boostMaxCents: code.boost_max_cents,
      matchRatio,
    });

    if (boost <= 0) {
      summary.skipped++;
      continue;
    }

    const stripeEventId = `sponsorship:${code.code}:${league.id}`;
    const auditReason =
      `sponsorship_code_${code.id}_redeemed_for_league_${league.id}`;

    const { error: insErr } = await adminClient.from("pot_ledger").insert({
      league_id: league.id,
      member_id: null,
      type: "sponsorship_credit",
      amount_cents: boost,
      currency: "USD",
      stripe_event_id: stripeEventId,
      audit_reason: auditReason,
      created_by: null,
    });

    if (insErr) {
      if (insErr.code === "23505") {
        await adminClient
          .from("leagues")
          .update({ sponsorship_status: "funded" })
          .eq("id", league.id)
          .eq("sponsorship_status", "redeemed_pending");
        await adminClient
          .from("sponsorship_codes")
          .update({
            status: "funded",
            funded_at: nowIso,
          })
          .eq("id", code.id)
          .eq("status", "redeemed");
        summary.funded++;
      } else {
        console.error(
          `[sponsorship-boost-tick] ledger insert league=${league.id}:`,
          insErr.message,
        );
        summary.skipped++;
      }
      continue;
    }

    await adminClient
      .from("leagues")
      .update({ sponsorship_status: "funded" })
      .eq("id", league.id);

    await adminClient
      .from("sponsorship_codes")
      .update({
        status: "funded",
        funded_at: nowIso,
      })
      .eq("id", code.id);

    const { error: refreshErr } = await adminClient.rpc("refresh_league_pot_balance");
    if (refreshErr) {
      console.warn(
        "[sponsorship-boost-tick] refresh MV failed:",
        refreshErr.message,
      );
    }

    summary.funded++;
  }

  return jsonOk(summary);
});

async function forfeitLeague(
  admin: ReturnType<typeof createClient>,
  leagueId: string,
  codeId: number,
) {
  const nowIso = new Date().toISOString();
  await admin
    .from("leagues")
    .update({
      sponsorship_status: "forfeited",
      sponsorship_code_id: null,
      sponsorship_boost_max_cents: 0,
    })
    .eq("id", leagueId)
    .eq("sponsorship_status", "redeemed_pending");

  await admin
    .from("sponsorship_codes")
    .update({
      status: "forfeited",
      forfeited_at: nowIso,
    })
    .eq("id", codeId)
    .eq("status", "redeemed");
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
