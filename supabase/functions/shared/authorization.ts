// Shared authorization-window opener. Used by:
//
//   - start-authorization-window (commissioner taps "Open authorization
//     window" — explicit human-in-the-loop path)
//   - sync-league-standings (system auto-opens the moment a final snapshot
//     lands; this is the "no commissioner needed" trust pitch — the same
//     reason the payout engine auto-fires)
//
// Idempotent: a second call against an already-`open` / `closed_*` league
// throws `already_started`. Callers decide whether to surface or swallow.
//
// Spec: docs/APP_FLOW.md Flow 8 + docs/TECH_SPEC.md §12 Sprint 4.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const DEFAULT_WINDOW_HOURS = 72;
export const MIN_WINDOW_HOURS = 24;
export const MAX_WINDOW_HOURS = 168; // 7 days; sane upper bound

export type AuthorizationErrorCode =
  | "league_not_found"
  | "lookup_failed"
  | "already_started"
  | "no_final_snapshot"
  | "no_linked_members"
  | "update_failed"
  | "seed_failed";

export class AuthorizationError extends Error {
  constructor(public code: AuthorizationErrorCode, message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export interface OpenWindowResult {
  league: Record<string, unknown>;
  snapshot_id: number;
  pending_count: number;
  window_hours: number;
}

export function clampWindowHours(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_WINDOW_HOURS;
  if (v < MIN_WINDOW_HOURS) return MIN_WINDOW_HOURS;
  if (v > MAX_WINDOW_HOURS) return MAX_WINDOW_HOURS;
  return Math.round(v);
}

export async function openAuthorizationWindow(args: {
  adminClient: SupabaseClient;
  leagueId: string;
  windowHours?: number;
}): Promise<OpenWindowResult> {
  const { adminClient, leagueId } = args;
  const windowHours = clampWindowHours(args.windowHours);

  // 1. League state guard. Only `not_started` is openable. Re-opening from
  // `closed_disputed` is a Pass 2 dispute-resolution flow with its own
  // surface, so we refuse here to avoid clobbering dispute state.
  const { data: league, error: leagueError } = await adminClient
    .from("leagues")
    .select("id, authorization_status, commissioner_profile_id")
    .eq("id", leagueId)
    .maybeSingle();
  if (leagueError) {
    throw new AuthorizationError(
      "lookup_failed",
      `League lookup failed: ${leagueError.message}`,
    );
  }
  if (!league) {
    throw new AuthorizationError("league_not_found", "League not found");
  }
  if (league.authorization_status !== "not_started") {
    throw new AuthorizationError(
      "already_started",
      `Authorization window already ${league.authorization_status}`,
    );
  }

  // 2. Final snapshot must exist. Auto-callers (sync-league-standings) will
  // call this directly after writing one, so this is rarely null in
  // practice — but the manual path needs the same guard so we assert it
  // here once.
  const { data: snapshot, error: snapshotError } = await adminClient
    .from("standings_snapshots")
    .select("id, is_final, fetched_at")
    .eq("league_id", league.id)
    .eq("is_final", true)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) {
    throw new AuthorizationError(
      "lookup_failed",
      `Snapshot lookup failed: ${snapshotError.message}`,
    );
  }
  if (!snapshot) {
    throw new AuthorizationError(
      "no_final_snapshot",
      "No final standings snapshot yet",
    );
  }

  // 3. Linked members. Unlinked Sleeper rows can't authenticate to vote, so
  // including them would freeze the window forever. We require ≥1 linked
  // member; in practice the commissioner is always linked, since they
  // imported the league.
  const { data: members, error: membersError } = await adminClient
    .from("league_members")
    .select("id")
    .eq("league_id", league.id)
    .not("linked_profile_id", "is", null);
  if (membersError) {
    throw new AuthorizationError(
      "lookup_failed",
      `Members lookup failed: ${membersError.message}`,
    );
  }
  if (!members || members.length === 0) {
    throw new AuthorizationError(
      "no_linked_members",
      "No linked members yet — at least one member must be on PotKeeper to authorize",
    );
  }

  // 4. Stamp window. Order matters — we flip the league row first so a
  // partial failure on the seed step leaves a recoverable state (`open`
  // with no rows; UI shows 0/N; the auto-finalize cron / manual retry can
  // pick it up).
  const startedAt = new Date();
  const closesAt = new Date(startedAt.getTime() + windowHours * 60 * 60 * 1000);

  const { data: updatedLeague, error: updateError } = await adminClient
    .from("leagues")
    .update({
      authorization_status: "open",
      authorization_window_started_at: startedAt.toISOString(),
      authorization_window_closes_at: closesAt.toISOString(),
    })
    .eq("id", league.id)
    .select()
    .single();
  if (updateError || !updatedLeague) {
    throw new AuthorizationError(
      "update_failed",
      `Failed to open window: ${updateError?.message ?? "unknown"}`,
    );
  }

  // 5. Seed pending rows. UNIQUE(snapshot_id, league_member_id) makes the
  // upsert idempotent — a retry won't duplicate.
  const seedRows = members.map((m) => ({
    league_id: league.id,
    snapshot_id: snapshot.id,
    league_member_id: m.id,
    status: "pending" as const,
  }));

  const { error: seedError } = await adminClient
    .from("standings_authorizations")
    .upsert(seedRows, {
      onConflict: "snapshot_id,league_member_id",
      ignoreDuplicates: true,
    });
  if (seedError) {
    throw new AuthorizationError(
      "seed_failed",
      `Failed to seed authorization rows: ${seedError.message}`,
    );
  }

  return {
    league: updatedLeague,
    snapshot_id: snapshot.id,
    pending_count: members.length,
    window_hours: windowHours,
  };
}
