// Shared payout engine — runs Stripe transfers for a league's authorized
// final standings. Used by:
//
//   - trigger-payout (manual commissioner trigger; safety valve / retry path)
//   - submit-authorization-vote (auto-fires the moment the last approval
//                                 lands; this is the "no commissioner needed"
//                                 trust pitch)
//
// Idempotent at the (league_id, snapshot_id) level via the payouts UNIQUE
// constraint; second concurrent call returns `already_triggered`. Callers
// decide how to surface that — auto-fire swallows it as a no-op, manual
// trigger surfaces a 409.
//
// Spec: docs/TECH_SPEC.md §8.

import type Stripe from "npm:stripe@latest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const PLATFORM_FEE_BASIS_POINTS = 250; // 2.5%
/** 5% held 30 days per winner rank — released by `release-reserves` cron (Pass 2C). */
const RESERVE_BASIS_POINTS = 500;
const RESERVE_HOLD_DAYS = 30;

export type PayoutErrorCode =
  | "league_not_found"
  | "not_authorized"
  | "no_final_snapshot"
  | "already_triggered"
  | "no_funds"
  | "no_split_configured"
  | "invalid_split"
  | "missing_standings_row"
  | "lookup_failed"
  | "insert_failed";

export class PayoutError extends Error {
  constructor(public code: PayoutErrorCode, message: string) {
    super(message);
    this.name = "PayoutError";
  }
}

export interface PayoutResultRow {
  id: number;
  rank: number;
  amount_cents: number;
  status: string;
  recipient_name: string;
  stripe_transfer_id: string | null;
  failure_reason: string | null;
}

export interface PayoutResult {
  pot_cents: number;
  fee_cents: number;
  distributable_cents: number;
  payouts: PayoutResultRow[];
}

interface NormalizedStanding {
  rank: number;
  league_member_id: string | null;
  external_user_id: string | null;
  roster_id: number;
}

export async function runPayoutForLeague(args: {
  adminClient: SupabaseClient;
  stripe: Stripe;
  leagueId: string;
  // null = system-fired (auto on last approval). Becomes payouts.initiated_by.
  initiatedBy: string | null;
}): Promise<PayoutResult> {
  const { adminClient, stripe, leagueId, initiatedBy } = args;

  // 1. Load league. We don't enforce commissioner here — that gate lives in
  // the trigger-payout HTTP wrapper. Auto-fire callers (e.g. the last
  // approving voter) wouldn't satisfy a commissioner check.
  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select("id, name, authorization_status, payout_split, buy_in_cents")
    .eq("id", leagueId)
    .maybeSingle();
  if (leagueError) {
    throw new PayoutError("lookup_failed", `League lookup failed: ${leagueError.message}`);
  }
  if (!league) {
    throw new PayoutError("league_not_found", "League not found");
  }
  if (league.authorization_status !== "closed_authorized") {
    throw new PayoutError(
      "not_authorized",
      `League is not authorized for payout (authorization_status=${league.authorization_status})`,
    );
  }

  // 2. Final snapshot.
  const { data: snapshot, error: snapshotError } = await adminClient
    .from("standings_snapshots")
    .select("id, standings, is_final, fetched_at")
    .eq("league_id", league.id)
    .eq("is_final", true)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) {
    throw new PayoutError("lookup_failed", `Snapshot lookup failed: ${snapshotError.message}`);
  }
  if (!snapshot) {
    throw new PayoutError("no_final_snapshot", "No final standings snapshot found for league");
  }

  // 3. Idempotency. Bail clearly if payouts already exist for this snapshot
  // — caller decides whether to surface or swallow.
  const { count: existingCount, error: existingError } = await adminClient
    .from("payouts")
    .select("id", { count: "exact", head: true })
    .eq("league_id", league.id)
    .eq("snapshot_id", snapshot.id);
  if (existingError) {
    throw new PayoutError("lookup_failed", `Existing payouts check failed: ${existingError.message}`);
  }
  if ((existingCount ?? 0) > 0) {
    throw new PayoutError(
      "already_triggered",
      "Payouts already triggered for this league + snapshot",
    );
  }

  // 4. Pot total from canonical ledger.
  const { data: ledgerRows, error: ledgerError } = await adminClient
    .from("pot_ledger")
    .select("amount_cents, type")
    .eq("league_id", league.id);
  if (ledgerError) {
    throw new PayoutError("lookup_failed", `Pot ledger read failed: ${ledgerError.message}`);
  }

  // Mirror `league_pot_balance` (migration 20260501000009): same inflow/outflow
  // buckets so pre-payout checks match the materialized view.
  let inflowTotal = 0;
  let outflowTotal = 0;
  for (const row of ledgerRows ?? []) {
    const t = row.type;
    if (t === "buy_in_paid" || t === "sponsorship_credit" || t === "reserve_released") {
      inflowTotal += row.amount_cents;
    } else if (
      [
        "payout_winner",
        "payout_charity",
        "platform_fee",
        "stripe_processing_fee",
        "refund_full",
        "refund_partial",
        "chargeback",
        "reserve_held",
      ].includes(t)
    ) {
      outflowTotal += row.amount_cents;
    }
  }
  const availableCents = inflowTotal - outflowTotal;
  if (availableCents <= 0) {
    throw new PayoutError(
      "no_funds",
      `Pot has no funds to distribute (available_cents=${availableCents})`,
    );
  }

  // 5. Fee + distributable.
  const feeCents = Math.floor((availableCents * PLATFORM_FEE_BASIS_POINTS) / 10000);
  const distributableCents = availableCents - feeCents;

  // 6. Parse split.
  const ranks = parseRanks(league.payout_split);
  if (ranks.length === 0) {
    throw new PayoutError("no_split_configured", "League payout_split has no ranks configured");
  }
  const totalPercent = ranks.reduce((sum, r) => sum + r.percent, 0);
  if (Math.abs(totalPercent - 100) > 0.01) {
    throw new PayoutError(
      "invalid_split",
      `Payout split percents must sum to 100 (got ${totalPercent})`,
    );
  }

  // 7. Allocate per-rank amounts. Round residual into rank 1 so the ledger
  // balances exactly.
  const allocations = ranks.map((r) => ({
    rank: r.rank,
    percent: r.percent,
    amount_cents: Math.floor((distributableCents * r.percent) / 100),
  }));
  const allocatedSum = allocations.reduce((s, a) => s + a.amount_cents, 0);
  const residual = distributableCents - allocatedSum;
  if (residual > 0 && allocations.length > 0) {
    allocations[0].amount_cents += residual;
  }

  // 8. Standings + recipient resolution.
  const standings = parseStandings(snapshot.standings);
  if (standings.length === 0) {
    throw new PayoutError("missing_standings_row", "Snapshot has no standings rows");
  }

  const lmIds = standings
    .filter((s) => allocations.some((a) => a.rank === s.rank))
    .map((s) => s.league_member_id)
    .filter((id): id is string => id != null);

  let lmRows: Array<{
    id: string;
    linked_profile_id: string | null;
    team_name: string | null;
    external_username: string | null;
    external_display_name: string | null;
  }> = [];
  if (lmIds.length > 0) {
    const { data, error } = await adminClient
      .from("league_members")
      .select("id, linked_profile_id, team_name, external_username, external_display_name")
      .in("id", lmIds);
    if (error) {
      throw new PayoutError("lookup_failed", `League member lookup failed: ${error.message}`);
    }
    lmRows = data ?? [];
  }
  const lmById = new Map(lmRows.map((r) => [r.id, r] as const));

  const profileIds = lmRows
    .map((r) => r.linked_profile_id)
    .filter((id): id is string => id != null);
  let profileRows: Array<{
    id: string;
    stripe_account_id: string | null;
    stripe_payouts_enabled: boolean | null;
  }> = [];
  if (profileIds.length > 0) {
    const { data, error } = await adminClient
      .from("profiles")
      .select("id, stripe_account_id, stripe_payouts_enabled")
      .in("id", profileIds);
    if (error) {
      throw new PayoutError("lookup_failed", `Profile lookup failed: ${error.message}`);
    }
    profileRows = data ?? [];
  }
  const profileById = new Map(profileRows.map((r) => [r.id, r] as const));

  const rankToRecipient = new Map<number, {
    league_member_id: string | null;
    profile_id: string | null;
    stripe_account_id: string | null;
    payouts_enabled: boolean;
    display_name: string;
  }>();

  for (const alloc of allocations) {
    const standing = standings.find((s) => s.rank === alloc.rank);
    if (!standing) {
      throw new PayoutError(
        "missing_standings_row",
        `No standings row found for rank ${alloc.rank}`,
      );
    }
    const lm = standing.league_member_id ? lmById.get(standing.league_member_id) : null;
    const profile = lm?.linked_profile_id ? profileById.get(lm.linked_profile_id) : null;
    rankToRecipient.set(alloc.rank, {
      league_member_id: lm?.id ?? null,
      profile_id: lm?.linked_profile_id ?? null,
      stripe_account_id: profile?.stripe_account_id ?? null,
      payouts_enabled: profile?.stripe_payouts_enabled === true,
      display_name:
        lm?.team_name ??
        lm?.external_display_name ??
        lm?.external_username ??
        `Roster ${standing.roster_id}`,
    });
  }

  // 9. Insert pending + reserved rows (95% / 5% per rank).
  const releaseAt = new Date();
  releaseAt.setUTCDate(releaseAt.getUTCDate() + RESERVE_HOLD_DAYS);

  const insertRows: Array<Record<string, unknown>> = [];
  for (const alloc of allocations) {
    const recipient = rankToRecipient.get(alloc.rank)!;
    const total = alloc.amount_cents;
    let immediateCents = Math.floor(
      (total * (10000 - RESERVE_BASIS_POINTS)) / 10000,
    );
    let reserveCents = total - immediateCents;
    if (immediateCents < 1 && total > 0) {
      immediateCents = 1;
      reserveCents = total - 1;
    }
    insertRows.push({
      league_id: league.id,
      snapshot_id: snapshot.id,
      recipient_kind: "winner",
      profile_id: recipient.profile_id,
      league_member_id: recipient.league_member_id,
      rank: alloc.rank,
      amount_cents: immediateCents,
      currency: "USD",
      status: "pending",
      payout_slice: "immediate",
      scheduled_for: null,
      stripe_destination_account: recipient.stripe_account_id,
      initiated_by: initiatedBy,
    });
    if (reserveCents > 0) {
      insertRows.push({
        league_id: league.id,
        snapshot_id: snapshot.id,
        recipient_kind: "winner",
        profile_id: recipient.profile_id,
        league_member_id: recipient.league_member_id,
        rank: alloc.rank,
        amount_cents: reserveCents,
        currency: "USD",
        status: "reserved",
        payout_slice: "reserve",
        scheduled_for: releaseAt.toISOString(),
        stripe_destination_account: recipient.stripe_account_id,
        initiated_by: initiatedBy,
      });
    }
  }

  const { data: insertedPayouts, error: insertErr } = await adminClient
    .from("payouts")
    .insert(insertRows)
    .select("id, rank, amount_cents, profile_id, stripe_destination_account, payout_slice");
  if (insertErr) {
    throw new PayoutError("insert_failed", `Payouts insert failed: ${insertErr.message}`);
  }
  const allInserted = insertedPayouts ?? [];

  for (const row of allInserted) {
    if (row.payout_slice !== "reserve") continue;
    const { error: rhErr } = await adminClient.from("pot_ledger").insert({
      league_id: league.id,
      member_id: row.profile_id,
      type: "reserve_held",
      amount_cents: row.amount_cents,
      currency: "USD",
      stripe_event_id: `reserve_hold:${row.id}`,
      created_by: initiatedBy,
    });
    if (rhErr && rhErr.code !== "23505") {
      console.error(
        `[runPayoutForLeague] reserve_held insert failed for payout ${row.id}:`,
        rhErr.message,
      );
    }
  }

  const payouts = allInserted.filter((p) => p.payout_slice === "immediate");

  // 10. Stripe transfers, sequentially.
  const transferGroup = `league_${league.id}_snapshot_${snapshot.id}`;
  const results: PayoutResultRow[] = [];

  for (const payout of payouts) {
    const recipient = rankToRecipient.get(payout.rank!)!;
    const baseResult = {
      id: payout.id,
      rank: payout.rank!,
      amount_cents: payout.amount_cents,
      recipient_name: recipient.display_name,
    };

    if (!recipient.stripe_account_id || !recipient.payouts_enabled) {
      const { error } = await adminClient
        .from("payouts")
        .update({ status: "waiting_on_connect" })
        .eq("id", payout.id);
      if (error) {
        console.error(
          `[runPayoutForLeague] mark waiting failed for payout ${payout.id}:`,
          error.message,
        );
      }
      results.push({
        ...baseResult,
        status: "waiting_on_connect",
        stripe_transfer_id: null,
        failure_reason: null,
      });
      continue;
    }

    let transfer: Stripe.Transfer;
    try {
      await adminClient
        .from("payouts")
        .update({ status: "processing" })
        .eq("id", payout.id);

      transfer = await stripe.transfers.create(
        {
          amount: payout.amount_cents,
          currency: "usd",
          destination: recipient.stripe_account_id,
          transfer_group: transferGroup,
          description: `${league.name} \u2014 rank ${payout.rank} payout`,
          metadata: {
            potkeeper_kind: "payout",
            league_id: league.id,
            league_name: league.name,
            snapshot_id: String(snapshot.id),
            payout_id: String(payout.id),
            rank: String(payout.rank),
            payout_slice: "immediate",
            profile_id: recipient.profile_id ?? "",
            initiated_by: initiatedBy ?? "system",
          },
        },
        {
          idempotencyKey: `potkeeper-payout-${payout.id}`,
        },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(
        `[runPayoutForLeague] transfer failed for payout ${payout.id}:`,
        message,
      );
      await adminClient
        .from("payouts")
        .update({
          status: "failed",
          failure_reason: message,
          failed_at: new Date().toISOString(),
        })
        .eq("id", payout.id);
      results.push({
        ...baseResult,
        status: "failed",
        stripe_transfer_id: null,
        failure_reason: message,
      });
      continue;
    }

    const nowIso = new Date().toISOString();
    await adminClient
      .from("payouts")
      .update({
        status: "paid",
        stripe_transfer_id: transfer.id,
        paid_at: nowIso,
      })
      .eq("id", payout.id);

    const { error: ledgerInsertErr } = await adminClient.from("pot_ledger").insert({
      league_id: league.id,
      member_id: recipient.profile_id,
      type: "payout_winner",
      amount_cents: payout.amount_cents,
      currency: "USD",
      stripe_transfer_id: transfer.id,
      created_by: initiatedBy,
    });
    if (ledgerInsertErr) {
      console.error(
        `[runPayoutForLeague] ledger insert failed for payout ${payout.id}:`,
        ledgerInsertErr.message,
      );
    }

    results.push({
      ...baseResult,
      status: "paid",
      stripe_transfer_id: transfer.id,
      failure_reason: null,
    });
  }

  // 11. Platform fee ledger row (single).
  if (feeCents > 0) {
    const { error: feeErr } = await adminClient.from("pot_ledger").insert({
      league_id: league.id,
      member_id: null,
      type: "platform_fee",
      amount_cents: feeCents,
      currency: "USD",
      created_by: initiatedBy,
    });
    if (feeErr) {
      console.error(`[runPayoutForLeague] platform fee ledger failed:`, feeErr.message);
    }
  }

  // 12. Refresh balance MV.
  const { error: refreshErr } = await adminClient.rpc("refresh_league_pot_balance");
  if (refreshErr) {
    console.warn("[runPayoutForLeague] refresh_league_pot_balance failed:", refreshErr.message);
  }

  return {
    pot_cents: availableCents,
    fee_cents: feeCents,
    distributable_cents: distributableCents,
    payouts: results,
  };
}

// ============================================================================
// Retry path
//
// `runPayoutForLeague` writes two payouts rows per winner rank on first call
// (`immediate` + `reserve` slice). Immediate transfers run inline; reserve
// rows stay `reserved` until `release-reserves` (or this helper for
// `waiting_on_connect` / `failed` once `scheduled_for` has passed). Same
// Stripe idempotency key pattern — safe to call repeatedly.
//
// Used by `retry-payout` (commissioner manual retry / recipient self-serve).
// ============================================================================

export interface RetryPayoutResult {
  retried: PayoutResultRow[];
  skipped: Array<{ id: number; rank: number; reason: string }>;
}

export async function retryPayoutsForLeague(args: {
  adminClient: SupabaseClient;
  stripe: Stripe;
  leagueId: string;
  initiatedBy: string | null;
  // Optional: retry just one row (for the recipient self-serve path). If
  // omitted, retries every row in (waiting_on_connect, failed).
  payoutId?: number;
}): Promise<RetryPayoutResult> {
  const { adminClient, stripe, leagueId, initiatedBy, payoutId } = args;

  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select("id, name, authorization_status")
    .eq("id", leagueId)
    .maybeSingle();
  if (leagueError) {
    throw new PayoutError("lookup_failed", `League lookup failed: ${leagueError.message}`);
  }
  if (!league) throw new PayoutError("league_not_found", "League not found");
  if (league.authorization_status !== "closed_authorized") {
    throw new PayoutError(
      "not_authorized",
      `League is not authorized for payout (authorization_status=${league.authorization_status})`,
    );
  }

  let payoutsQuery = adminClient
    .from("payouts")
    .select(
      "id, rank, amount_cents, status, profile_id, league_member_id, stripe_destination_account, snapshot_id, payout_slice, scheduled_for",
    )
    .eq("league_id", league.id)
    .in("status", ["waiting_on_connect", "failed"]);
  if (payoutId != null) {
    payoutsQuery = payoutsQuery.eq("id", payoutId);
  }
  const { data: rows, error: rowsError } = await payoutsQuery;
  if (rowsError) {
    throw new PayoutError("lookup_failed", `Payouts lookup failed: ${rowsError.message}`);
  }
  const nowIso = new Date().toISOString();
  const pending = (rows ?? []).filter((p) => {
    if (p.payout_slice === "reserve") {
      const sched = p.scheduled_for;
      if (sched == null || sched > nowIso) return false;
    }
    return true;
  });
  if (pending.length === 0) {
    return { retried: [], skipped: [] };
  }

  // Re-resolve current Connect status for each profile. We always re-read
  // because between original payout and now, the profile likely finished
  // onboarding — that's the whole point of retrying.
  const profileIds = Array.from(
    new Set(pending.map((p) => p.profile_id).filter((id): id is string => !!id)),
  );
  let profileById = new Map<string, { stripe_account_id: string | null; stripe_payouts_enabled: boolean | null }>();
  if (profileIds.length > 0) {
    const { data: profiles, error: profilesErr } = await adminClient
      .from("profiles")
      .select("id, stripe_account_id, stripe_payouts_enabled")
      .in("id", profileIds);
    if (profilesErr) {
      throw new PayoutError("lookup_failed", `Profile lookup failed: ${profilesErr.message}`);
    }
    profileById = new Map(
      (profiles ?? []).map((p) => [
        p.id,
        {
          stripe_account_id: p.stripe_account_id,
          stripe_payouts_enabled: p.stripe_payouts_enabled,
        },
      ]),
    );
  }

  // For display names we hit league_members.
  const lmIds = Array.from(
    new Set(
      pending.map((p) => p.league_member_id).filter((id): id is string => !!id),
    ),
  );
  let lmById = new Map<string, { team_name: string | null; external_username: string | null; external_display_name: string | null }>();
  if (lmIds.length > 0) {
    const { data: lms, error: lmErr } = await adminClient
      .from("league_members")
      .select("id, team_name, external_username, external_display_name")
      .in("id", lmIds);
    if (lmErr) {
      throw new PayoutError("lookup_failed", `League member lookup failed: ${lmErr.message}`);
    }
    lmById = new Map((lms ?? []).map((m) => [m.id, m]));
  }

  const retried: PayoutResultRow[] = [];
  const skipped: RetryPayoutResult["skipped"] = [];
  for (const p of pending) {
    const display =
      lmById.get(p.league_member_id ?? "")?.team_name ??
      lmById.get(p.league_member_id ?? "")?.external_display_name ??
      lmById.get(p.league_member_id ?? "")?.external_username ??
      `Rank ${p.rank}`;
    const profile = p.profile_id ? profileById.get(p.profile_id) : null;
    const accountId = profile?.stripe_account_id ?? null;
    const payoutsEnabled = profile?.stripe_payouts_enabled === true;

    // Still not onboarded — leave waiting_on_connect, don't touch Stripe.
    if (!accountId || !payoutsEnabled) {
      skipped.push({ id: p.id, rank: p.rank ?? 0, reason: "still_waiting_on_connect" });
      // Keep status as waiting_on_connect (idempotent). If it was `failed`
      // for an unrelated reason and they're now also missing Connect, mark
      // it back as waiting so the UI shows the right state.
      if (p.status !== "waiting_on_connect") {
        await adminClient
          .from("payouts")
          .update({ status: "waiting_on_connect", failure_reason: null })
          .eq("id", p.id);
      }
      continue;
    }

    let transfer: Stripe.Transfer;
    try {
      await adminClient
        .from("payouts")
        .update({ status: "processing", failure_reason: null })
        .eq("id", p.id);

      const isReserveRetry = p.payout_slice === "reserve";
      transfer = await stripe.transfers.create(
        {
          amount: p.amount_cents,
          currency: "usd",
          destination: accountId,
          transfer_group: `league_${league.id}_snapshot_${p.snapshot_id}`,
          description: isReserveRetry
            ? `${league.name} \u2014 rank ${p.rank} reserve release (retry)`
            : `${league.name} \u2014 rank ${p.rank} payout (retry)`,
          metadata: {
            potkeeper_kind: "payout",
            league_id: league.id,
            league_name: league.name,
            snapshot_id: String(p.snapshot_id),
            payout_id: String(p.id),
            rank: String(p.rank ?? ""),
            profile_id: p.profile_id ?? "",
            payout_slice: p.payout_slice ?? "immediate",
            initiated_by: initiatedBy ?? "system",
            retry: "true",
          },
        },
        {
          idempotencyKey: isReserveRetry
            ? `potkeeper-reserve-release-${p.id}`
            : `potkeeper-payout-${p.id}`,
        },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await adminClient
        .from("payouts")
        .update({
          status: "failed",
          failure_reason: message,
          failed_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      retried.push({
        id: p.id,
        rank: p.rank ?? 0,
        amount_cents: p.amount_cents,
        recipient_name: display,
        status: "failed",
        stripe_transfer_id: null,
        failure_reason: message,
      });
      continue;
    }

    const nowIso = new Date().toISOString();
    await adminClient
      .from("payouts")
      .update({
        status: "paid",
        stripe_destination_account: accountId,
        stripe_transfer_id: transfer.id,
        paid_at: nowIso,
      })
      .eq("id", p.id);

    const ledgerType = p.payout_slice === "reserve" ? "reserve_released" : "payout_winner";
    const ledgerPayload: Record<string, unknown> = {
      league_id: league.id,
      member_id: p.profile_id,
      type: ledgerType,
      amount_cents: p.amount_cents,
      currency: "USD",
      stripe_transfer_id: transfer.id,
      created_by: initiatedBy,
    };
    if (ledgerType === "reserve_released") {
      ledgerPayload.stripe_event_id = `reserve_release:${p.id}`;
    }
    const { error: ledgerErr } = await adminClient.from("pot_ledger").insert(ledgerPayload);
    if (ledgerErr && ledgerErr.code !== "23505") {
      console.error(
        `[retryPayoutsForLeague] ledger insert failed for payout ${p.id}:`,
        ledgerErr.message,
      );
    }

    retried.push({
      id: p.id,
      rank: p.rank ?? 0,
      amount_cents: p.amount_cents,
      recipient_name: display,
      status: "paid",
      stripe_transfer_id: transfer.id,
      failure_reason: null,
    });
  }

  // Refresh balance MV so the UI shows post-retry totals.
  const { error: refreshErr } = await adminClient.rpc("refresh_league_pot_balance");
  if (refreshErr) {
    console.warn("[retryPayoutsForLeague] refresh_league_pot_balance failed:", refreshErr.message);
  }

  return { retried, skipped };
}

export interface ReleaseReservesSummary {
  released: number;
  skipped_dispute: number;
  skipped_connect: number;
  failed: number;
}

/**
 * Cron entrypoint: transfer 5% reserve slices whose `scheduled_for` is past,
 * unless the league has open buy-in disputes (D4.a). Idempotent per payout
 * row via `potkeeper-reserve-release-${id}`.
 */
export async function releaseDueReservePayouts(args: {
  adminClient: SupabaseClient;
  stripe: Stripe;
  limit?: number;
}): Promise<ReleaseReservesSummary> {
  const { adminClient, stripe, limit = 100 } = args;
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await adminClient
    .from("payouts")
    .select(
      `
      id, rank, amount_cents, status, profile_id, league_member_id,
      stripe_destination_account, snapshot_id, league_id,
      leagues!inner ( name, buyin_dispute_open_count )
    `,
    )
    .eq("payout_slice", "reserve")
    .in("status", ["reserved", "waiting_on_connect", "failed"])
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[releaseDueReservePayouts] query failed:", error.message);
    throw new PayoutError("lookup_failed", error.message);
  }

  const summary: ReleaseReservesSummary = {
    released: 0,
    skipped_dispute: 0,
    skipped_connect: 0,
    failed: 0,
  };

  const list = rows ?? [];
  if (list.length === 0) {
    return summary;
  }

  const profileIds = Array.from(
    new Set(list.map((r) => r.profile_id).filter((id): id is string => !!id)),
  );

  let profileById = new Map<
    string,
    { stripe_account_id: string | null; stripe_payouts_enabled: boolean | null }
  >();
  if (profileIds.length > 0) {
    const { data: profiles, error: pErr } = await adminClient
      .from("profiles")
      .select("id, stripe_account_id, stripe_payouts_enabled")
      .in("id", profileIds);
    if (pErr) {
      throw new PayoutError("lookup_failed", `Profile lookup failed: ${pErr.message}`);
    }
    profileById = new Map(
      (profiles ?? []).map((p) => [
        p.id,
        {
          stripe_account_id: p.stripe_account_id,
          stripe_payouts_enabled: p.stripe_payouts_enabled,
        },
      ]),
    );
  }

  for (const raw of list) {
    const row = raw as {
      id: number;
      rank: number | null;
      amount_cents: number;
      status: string;
      profile_id: string | null;
      league_member_id: string | null;
      stripe_destination_account: string | null;
      snapshot_id: number;
      league_id: string;
      leagues: { name: string; buyin_dispute_open_count: number };
    };

    const leagueMeta = row.leagues;
    const leagueName = leagueMeta.name;
    const leagueId = row.league_id;

    if ((leagueMeta.buyin_dispute_open_count ?? 0) > 0) {
      summary.skipped_dispute++;
      continue;
    }

    const profile = row.profile_id ? profileById.get(row.profile_id) : null;
    const accountId = profile?.stripe_account_id ?? null;
    const payoutsEnabled = profile?.stripe_payouts_enabled === true;

    if (!accountId || !payoutsEnabled) {
      if (row.status !== "waiting_on_connect") {
        await adminClient
          .from("payouts")
          .update({ status: "waiting_on_connect", failure_reason: null })
          .eq("id", row.id);
      }
      summary.skipped_connect++;
      continue;
    }

    let transfer: Stripe.Transfer;
    try {
      await adminClient
        .from("payouts")
        .update({ status: "processing", failure_reason: null })
        .eq("id", row.id);

      transfer = await stripe.transfers.create(
        {
          amount: row.amount_cents,
          currency: "usd",
          destination: accountId,
          transfer_group: `league_${leagueId}_snapshot_${row.snapshot_id}`,
          description: `${leagueName} \u2014 rank ${row.rank} reserve release`,
          metadata: {
            potkeeper_kind: "payout",
            league_id: leagueId,
            league_name: leagueName,
            snapshot_id: String(row.snapshot_id),
            payout_id: String(row.id),
            rank: String(row.rank ?? ""),
            profile_id: row.profile_id ?? "",
            payout_slice: "reserve",
            initiated_by: "system",
            reserve_release: "true",
          },
        },
        { idempotencyKey: `potkeeper-reserve-release-${row.id}` },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[releaseDueReservePayouts] transfer failed payout ${row.id}:`, message);
      await adminClient
        .from("payouts")
        .update({
          status: "failed",
          failure_reason: message,
          failed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      summary.failed++;
      continue;
    }

    const nowPaid = new Date().toISOString();
    await adminClient
      .from("payouts")
      .update({
        status: "paid",
        stripe_destination_account: accountId,
        stripe_transfer_id: transfer.id,
        paid_at: nowPaid,
      })
      .eq("id", row.id);

    const { error: ledgerErr } = await adminClient.from("pot_ledger").insert({
      league_id: leagueId,
      member_id: row.profile_id,
      type: "reserve_released",
      amount_cents: row.amount_cents,
      currency: "USD",
      stripe_transfer_id: transfer.id,
      stripe_event_id: `reserve_release:${row.id}`,
      created_by: null,
    });
    if (ledgerErr && ledgerErr.code !== "23505") {
      console.error(
        `[releaseDueReservePayouts] ledger insert failed for payout ${row.id}:`,
        ledgerErr.message,
      );
    }

    summary.released++;
  }

  const { error: refreshErr } = await adminClient.rpc("refresh_league_pot_balance");
  if (refreshErr) {
    console.warn(
      "[releaseDueReservePayouts] refresh_league_pot_balance failed:",
      refreshErr.message,
    );
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Local parsers (mirrors of the app-side ones; we keep the engine isolated
// so it can be reasoned about without dragging the app's type tree in).
// ---------------------------------------------------------------------------

function parseRanks(payoutSplit: unknown): Array<{ rank: number; percent: number }> {
  if (!payoutSplit || typeof payoutSplit !== "object" || Array.isArray(payoutSplit)) return [];
  const ranks = (payoutSplit as { ranks?: Record<string, number> }).ranks;
  if (!ranks || typeof ranks !== "object") return [];
  return Object.entries(ranks)
    .map(([rank, percent]) => ({
      rank: Number(rank),
      percent: typeof percent === "number" ? percent : Number(percent),
    }))
    .filter((r) => Number.isFinite(r.rank) && Number.isFinite(r.percent))
    .sort((a, b) => a.rank - b.rank);
}

function parseStandings(value: unknown): NormalizedStanding[] {
  if (!Array.isArray(value)) return [];
  const out: NormalizedStanding[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rank = Number(r.rank);
    if (!Number.isFinite(rank)) continue;
    out.push({
      rank,
      league_member_id: typeof r.league_member_id === "string" ? r.league_member_id : null,
      external_user_id: typeof r.external_user_id === "string" ? r.external_user_id : null,
      roster_id: typeof r.roster_id === "number" ? r.roster_id : 0,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}
