// Edge function: stripe-webhook
//
// Public endpoint (no JWT). Stripe signs every request with
// `Stripe-Signature` using STRIPE_WEBHOOK_SECRET; if the signature
// doesn't verify we 400 immediately. Idempotency is enforced via the
// `stripe_event_id` UNIQUE constraint on pot_ledger — replays inserted
// twice are caught and dropped silently.
//
// Pass 1 events:
//   - checkout.session.completed   → buy-in succeeded; write ledger,
//                                    mark league_member.paid,
//                                    Checkpoint 2/3 billing-state check,
//                                    set profile.geo_status = 'verified'
//                                    on first paid action.
//
// Pass 2A events (Sprint 4 payout engine):
//   - transfer.failed              → flip payouts.status='failed', record
//                                    failure_reason for the recipient UI
//   - transfer.reversed            → flip payouts.status='reversed' (rare;
//                                    only fires on chargeback or manual
//                                    intervention)
//
// Note: `transfer.created` is *not* handled here. trigger-payout marks
// payouts.status='paid' synchronously on the transfer.create() return,
// which is the truthful state. We only listen for the post-hoc failure
// signals via webhook.
//
// Pass 2C:
//   - account.updated / account.application.deauthorized → mirror Connect state
//   - charge.dispute.created / closed → buy-in dispute counter (reserve release pause)
//
// Spec coverage: docs/TECH_SPEC.md §6 (Stripe webhook handlers).
//
// Deployment notes (one-time):
//   1. Deploy with --no-verify-jwt:
//        supabase functions deploy stripe-webhook --no-verify-jwt
//   2. Register the webhook in Stripe dashboard:
//        URL:    https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//        Events: checkout.session.completed
//   3. Copy the signing secret into Supabase secrets:
//        supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@latest";

import { RESTRICTED_STATES } from "./restricted-states.ts";

// CORS not needed for webhook (Stripe doesn't send preflight) but keep
// the OPTIONS handler around so any health check tools work.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function plainResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return plainResponse(405, "Method not allowed");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !stripeKey || !webhookSecret) {
    console.error(
      "[stripe-webhook] missing config",
      { hasUrl: !!supabaseUrl, hasService: !!serviceRoleKey, hasStripe: !!stripeKey, hasWebhook: !!webhookSecret },
    );
    return plainResponse(500, "Webhook not configured");
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return plainResponse(400, "Missing stripe-signature header");
  }

  const rawBody = await req.text();

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-09-30.clover",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    // Deno-compatible verification — needs the async variant since the
    // sync one uses Node's `crypto` module which isn't available here.
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[stripe-webhook] signature verification failed:", message);
    return plainResponse(400, `Signature verification failed: ${message}`);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          stripe,
          adminClient,
          event.id,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "transfer.failed":
        await handleTransferFailed(
          adminClient,
          event.data.object as Stripe.Transfer,
        );
        break;
      case "transfer.reversed":
        await handleTransferReversed(
          adminClient,
          event.data.object as Stripe.Transfer,
        );
        break;
      case "account.updated":
        await handleAccountUpdated(
          adminClient,
          event.data.object as Stripe.Account,
        );
        break;
      case "account.application.deauthorized": {
        const accId = typeof event.account === "string" ? event.account : null;
        if (accId) {
          await handleAccountDeauthorized(adminClient, accId);
        }
        break;
      }
      case "charge.dispute.created":
        await handleChargeDisputeCreated(
          stripe,
          adminClient,
          event.id,
          event.data.object as Stripe.Dispute,
        );
        break;
      case "charge.dispute.closed":
        await handleChargeDisputeClosed(
          stripe,
          adminClient,
          event.id,
          event.data.object as Stripe.Dispute,
        );
        break;
      default:
        console.log(`[stripe-webhook] ignoring ${event.type}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[stripe-webhook] handler for ${event.type} failed:`, message);
    // Return 500 so Stripe retries. Idempotency keys make retries safe.
    return plainResponse(500, `Handler error: ${message}`);
  }

  return plainResponse(200, "ok");
});

// ============================================================================
// Handler: checkout.session.completed
// ============================================================================
//
// Fires when the customer finishes paying on Stripe's hosted Checkout. The
// session has the metadata we set in stripe-create-buy-in-session, plus
// payment_status=paid (assuming the charge cleared). Stripe also exposes
// the underlying PaymentIntent which carries the billing details we
// need for Checkpoint 2/3.

async function handleCheckoutCompleted(
  stripe: Stripe,
  admin: ReturnType<typeof createClient>,
  eventId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const md = session.metadata ?? {};
  if (md.potkeeper_kind !== "buy_in") {
    console.log(
      `[stripe-webhook] ignoring non-buy_in session ${session.id} (kind=${md.potkeeper_kind})`,
    );
    return;
  }

  if (session.payment_status !== "paid") {
    console.log(
      `[stripe-webhook] session ${session.id} not paid (status=${session.payment_status})`,
    );
    return;
  }

  const leagueId = md.league_id;
  const memberId = md.league_member_id;
  const profileId = md.profile_id;
  const buyInCents = Number(md.buy_in_cents ?? "0");

  if (!leagueId || !memberId || !profileId || !Number.isFinite(buyInCents) || buyInCents <= 0) {
    console.error(
      "[stripe-webhook] checkout.session.completed missing/invalid metadata",
      md,
    );
    return;
  }

  // Pull the underlying PaymentIntent for charge id + billing details.
  // Checkout sessions carry payment_intent as either a string or expanded
  // object depending on creation params; we always re-fetch to be safe.
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!paymentIntentId) {
    console.error(`[stripe-webhook] no payment_intent on session ${session.id}`);
    return;
  }

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
  const charge = typeof pi.latest_charge === "string"
    ? null
    : pi.latest_charge ?? null;

  // Billing state lives on the Charge's billing_details (which Stripe
  // copies from Checkout's collected billing address).
  const billingState = charge?.billing_details?.address?.state ?? null;
  const billingCountry = charge?.billing_details?.address?.country ?? null;

  // Checkpoint 2/3: if the billing state is in a restricted jurisdiction,
  // suspend the account and DO NOT credit the pot. Pass 1 punts on the
  // refund — Pass 2 will issue an immediate refund here. For now the
  // money is held by Stripe and ops can manually refund from the
  // dashboard while the engineering team builds the full reconciliation.
  if (
    billingCountry === "US" &&
    billingState != null &&
    RESTRICTED_STATES.has(billingState.toUpperCase())
  ) {
    console.warn(
      `[stripe-webhook] restricted billing state ${billingState} on session ${session.id}; suspending profile ${profileId}`,
    );
    await admin
      .from("profiles")
      .update({
        geo_status: "suspended",
        billing_state: billingState,
      })
      .eq("id", profileId);
    // Stop here. No ledger credit, no payment_status flip. The user will
    // see Screen 5.0.1 "We can't verify your account" on their next
    // session-aware screen render.
    return;
  }

  // Checkpoint 2 happy path — first paid action verifies billing.
  if (billingState && billingCountry === "US") {
    await admin
      .from("profiles")
      .update({
        geo_status: "verified",
        billing_state: billingState,
        setup_intent_completed_at: new Date().toISOString(),
      })
      .eq("id", profileId);
  }

  // Two layers of dedup before we insert:
  //
  //   1. By stripe_event_id (UNIQUE constraint catches it post-insert).
  //      Handles Stripe's own automatic retries of the same event.
  //
  //   2. By stripe_payment_intent_id + type='buy_in_paid' (manual check
  //      pre-insert). Handles cases where the same PI gets credited
  //      twice through *different* event ids — e.g., we manually
  //      credited from ops earlier, then a delayed webhook retry lands.
  //      Without this, the UNIQUE on event_id wouldn't match (different
  //      event_ids) and we'd double-credit the pot.
  const { data: existingForPi, error: existingErr } = await admin
    .from("pot_ledger")
    .select("id, stripe_event_id")
    .eq("type", "buy_in_paid")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (existingErr) {
    throw new Error(`pot_ledger pre-check failed: ${existingErr.message}`);
  }
  if (existingForPi) {
    console.log(
      `[stripe-webhook] payment_intent ${paymentIntentId} already credited (ledger row ${existingForPi.id}, event_id ${existingForPi.stripe_event_id}); skipping`,
    );
    return;
  }

  const { error: ledgerError } = await admin.from("pot_ledger").insert({
    league_id: leagueId,
    member_id: profileId,
    type: "buy_in_paid",
    amount_cents: buyInCents,
    currency: "usd",
    stripe_event_id: eventId,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: charge?.id ?? null,
    created_by: profileId,
  });

  if (ledgerError) {
    // Postgres error code 23505 = unique_violation on stripe_event_id.
    // Stripe replayed an event we've already processed — drop silently.
    if (ledgerError.code === "23505") {
      console.log(
        `[stripe-webhook] duplicate event ${eventId} dropped (idempotent replay)`,
      );
      return;
    }
    throw new Error(`pot_ledger insert failed: ${ledgerError.message}`);
  }

  // Flip the league_members row to paid. We scope by id to avoid any
  // chance of touching the wrong row (the metadata's member_id is
  // canonical).
  const { error: memberUpdateError } = await admin
    .from("league_members")
    .update({ payment_status: "paid" })
    .eq("id", memberId);
  if (memberUpdateError) {
    // Don't throw — the money is already credited to the pot. Surface
    // for ops follow-up. The reconciliation cron in Pass 2 will catch
    // this drift between ledger and member status.
    console.error(
      `[stripe-webhook] member status update failed for ${memberId}:`,
      memberUpdateError.message,
    );
  }

  // Refresh the materialized view so the league detail screen sees the
  // new pot balance immediately. Best-effort — if it fails the next
  // ledger write will refresh it.
  const { error: refreshError } = await admin.rpc("refresh_league_pot_balance");
  if (refreshError) {
    console.warn(
      "[stripe-webhook] refresh_league_pot_balance failed:",
      refreshError.message,
    );
  }

  console.log(
    `[stripe-webhook] credited ${buyInCents}¢ to league ${leagueId} for member ${memberId}`,
  );
}

// ============================================================================
// Handler: transfer.failed
// ============================================================================
//
// Fires when Stripe can't deliver a transfer to the destination Connect
// account. The most common case is the recipient's bank rejecting the
// payout (insufficient verification, account closed, etc). When this lands,
// we flip the payouts row to 'failed' and let the recipient see the failure
// in their wallet. Pass 2B will add the retry-payout Edge Function so the
// commissioner can re-fire once the recipient sorts their account out.

async function handleTransferFailed(
  admin: ReturnType<typeof createClient>,
  transfer: Stripe.Transfer,
): Promise<void> {
  const failureMessage = transfer.description ?? "Transfer failed";

  const { data: rows, error: lookupErr } = await admin
    .from("payouts")
    .select("id, status, league_id")
    .eq("stripe_transfer_id", transfer.id);
  if (lookupErr) {
    throw new Error(`payouts lookup by transfer_id failed: ${lookupErr.message}`);
  }
  if (!rows || rows.length === 0) {
    console.warn(
      `[stripe-webhook] transfer.failed for unknown transfer ${transfer.id}`,
    );
    return;
  }

  for (const row of rows) {
    // Don't downgrade an already-reversed row; reversed is a stronger
    // terminal state than failed.
    if (row.status === "reversed") continue;

    const { error: updateErr } = await admin
      .from("payouts")
      .update({
        status: "failed",
        failure_reason: failureMessage,
        failed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateErr) {
      throw new Error(
        `payouts update failed for transfer ${transfer.id}: ${updateErr.message}`,
      );
    }
    console.log(
      `[stripe-webhook] payout ${row.id} (transfer ${transfer.id}) marked failed: ${failureMessage}`,
    );
  }
}

// ============================================================================
// Handler: transfer.reversed
// ============================================================================
//
// Fires when an originally-successful transfer gets reversed (chargeback,
// fraud team intervention, manual reversal from the Stripe dashboard).
// Reverses the pot_ledger entry too — we write a chargeback row rather
// than deleting the original payout_winner row, keeping the audit log
// append-only.

async function handleTransferReversed(
  admin: ReturnType<typeof createClient>,
  transfer: Stripe.Transfer,
): Promise<void> {
  const { data: rows, error: lookupErr } = await admin
    .from("payouts")
    .select("id, league_id, profile_id, amount_cents")
    .eq("stripe_transfer_id", transfer.id);
  if (lookupErr) {
    throw new Error(`payouts lookup by transfer_id failed: ${lookupErr.message}`);
  }
  if (!rows || rows.length === 0) {
    console.warn(
      `[stripe-webhook] transfer.reversed for unknown transfer ${transfer.id}`,
    );
    return;
  }

  for (const row of rows) {
    const { error: updateErr } = await admin
      .from("payouts")
      .update({
        status: "reversed",
        failure_reason: "Transfer reversed",
        failed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateErr) {
      throw new Error(
        `payouts update failed for transfer ${transfer.id}: ${updateErr.message}`,
      );
    }

    // Append a chargeback row so the ledger nets back to the pre-payout
    // balance. The original payout_winner row stays put.
    const { error: ledgerErr } = await admin.from("pot_ledger").insert({
      league_id: row.league_id,
      member_id: row.profile_id,
      type: "chargeback",
      amount_cents: row.amount_cents,
      currency: "USD",
      stripe_transfer_id: transfer.id,
    });
    if (ledgerErr && ledgerErr.code !== "23505") {
      console.error(
        `[stripe-webhook] chargeback ledger insert failed for transfer ${transfer.id}:`,
        ledgerErr.message,
      );
    }
    console.log(
      `[stripe-webhook] payout ${row.id} (transfer ${transfer.id}) marked reversed`,
    );
  }

  const { error: refreshErr } = await admin.rpc("refresh_league_pot_balance");
  if (refreshErr) {
    console.warn(
      "[stripe-webhook] refresh_league_pot_balance failed after reversal:",
      refreshErr.message,
    );
  }
}

// ============================================================================
// Pass 2C: Connect account lifecycle
// ============================================================================

async function handleAccountUpdated(
  admin: ReturnType<typeof createClient>,
  account: Stripe.Account,
): Promise<void> {
  const { data, error } = await admin
    .from("profiles")
    .update({
      stripe_payouts_enabled: account.payouts_enabled === true,
      stripe_charges_enabled: account.charges_enabled === true,
      stripe_details_submitted: account.details_submitted === true,
      stripe_requirements: account.requirements
        ? JSON.parse(JSON.stringify(account.requirements))
        : null,
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", account.id)
    .select("id");
  if (error) {
    throw new Error(`profile Connect sync failed: ${error.message}`);
  }
  if (data && data.length > 0) {
    console.log(
      `[stripe-webhook] account.updated synced ${data.length} profile(s) for ${account.id}`,
    );
  }
}

async function handleAccountDeauthorized(
  admin: ReturnType<typeof createClient>,
  accountId: string,
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({
      stripe_payouts_enabled: false,
      stripe_charges_enabled: false,
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", accountId);
  if (error) {
    throw new Error(`profile deauthorize sync failed: ${error.message}`);
  }
  console.log(`[stripe-webhook] account deauthorized for Connect account ${accountId}`);
}

// ============================================================================
// Pass 2C: buy-in disputes (pause reserve release — D4.a)
// ============================================================================

async function handleChargeDisputeCreated(
  stripe: Stripe,
  admin: ReturnType<typeof createClient>,
  eventId: string,
  dispute: Stripe.Dispute,
): Promise<void> {
  const chargeId = typeof dispute.charge === "string"
    ? dispute.charge
    : dispute.charge?.id;
  if (!chargeId) {
    console.warn(`[stripe-webhook] dispute ${dispute.id} has no charge`);
    return;
  }

  const charge = await stripe.charges.retrieve(chargeId);
  const md = charge.metadata ?? {};
  if (md.potkeeper_kind !== "buy_in" || !md.league_id) {
    console.log(
      `[stripe-webhook] ignoring dispute ${dispute.id} (not PotKeeper buy-in)`,
    );
    return;
  }

  const leagueId = md.league_id;
  const profileId =
    typeof md.profile_id === "string" && md.profile_id.length > 0
      ? md.profile_id
      : null;

  const { error: ledgerErr } = await admin.from("pot_ledger").insert({
    league_id: leagueId,
    member_id: profileId,
    type: "chargeback",
    amount_cents: dispute.amount,
    currency: "USD",
    stripe_event_id: eventId,
    stripe_charge_id: chargeId,
  });
  if (ledgerErr && ledgerErr.code !== "23505") {
    throw new Error(`chargeback ledger insert: ${ledgerErr.message}`);
  }

  const { data: league, error: leagueErr } = await admin
    .from("leagues")
    .select("buyin_dispute_open_count")
    .eq("id", leagueId)
    .maybeSingle();
  if (leagueErr) {
    throw new Error(`league lookup: ${leagueErr.message}`);
  }
  const nextCount = (league?.buyin_dispute_open_count ?? 0) + 1;
  const { error: updErr } = await admin
    .from("leagues")
    .update({ buyin_dispute_open_count: nextCount })
    .eq("id", leagueId);
  if (updErr) {
    throw new Error(`league dispute counter: ${updErr.message}`);
  }

  const { error: refreshErr } = await admin.rpc("refresh_league_pot_balance");
  if (refreshErr) {
    console.warn(
      "[stripe-webhook] refresh_league_pot_balance after dispute:",
      refreshErr.message,
    );
  }
  console.log(
    `[stripe-webhook] buy-in dispute ${dispute.id} opened for league ${leagueId} (counter=${nextCount})`,
  );
}

async function handleChargeDisputeClosed(
  stripe: Stripe,
  admin: ReturnType<typeof createClient>,
  _eventId: string,
  dispute: Stripe.Dispute,
): Promise<void> {
  const chargeId = typeof dispute.charge === "string"
    ? dispute.charge
    : dispute.charge?.id;
  if (!chargeId) return;

  const charge = await stripe.charges.retrieve(chargeId);
  const md = charge.metadata ?? {};
  if (md.potkeeper_kind !== "buy_in" || !md.league_id) {
    return;
  }

  const leagueId = md.league_id;
  const { data: league, error: leagueErr } = await admin
    .from("leagues")
    .select("buyin_dispute_open_count")
    .eq("id", leagueId)
    .maybeSingle();
  if (leagueErr) {
    throw new Error(`league lookup: ${leagueErr.message}`);
  }
  const cur = league?.buyin_dispute_open_count ?? 0;
  const next = Math.max(0, cur - 1);
  const { error: updErr } = await admin
    .from("leagues")
    .update({ buyin_dispute_open_count: next })
    .eq("id", leagueId);
  if (updErr) {
    throw new Error(`league dispute counter: ${updErr.message}`);
  }
  console.log(
    `[stripe-webhook] buy-in dispute ${dispute.id} closed for league ${leagueId} (counter=${next})`,
  );
}
