import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Text } from "~/components/ui/text";
import { ScreenTopBar } from "~/components/ScreenTopBar";
import { useSession } from "~/context";
import type { Json, Tables } from "~/lib/database.types";
import { supabase } from "~/utils/supabase";

// ============================================================================
// Standings Authorization screen — APP_FLOW Screen 8.2.
//
// Members vote "Looks right" or "Something's wrong" against the final
// snapshot. Pass 1 closes immediately on first dispute (frozen — Pass 2 will
// add a resolution flow). Auto-firing payouts on full approval is Sprint 4
// Pass 2 too — for now we just record the consensus.
// ============================================================================

type League = Tables<"leagues">;
type LeagueMember = Tables<"league_members">;
type StandingsSnapshot = Tables<"standings_snapshots">;
type Authorization = Tables<"standings_authorizations">;

type NormalizedStanding = {
  rank: number;
  league_member_id: string | null;
  external_user_id: string | null;
  roster_id: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
};

type Decision = "approved" | "disputed";

export default function AuthorizeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [snapshot, setSnapshot] = useState<StandingsSnapshot | null>(null);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live ticking state for the countdown banner. We only track Date.now()
  // (re-rendering every second); the actual close target lives on the league.
  const [now, setNow] = useState(() => Date.now());

  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [leagueRes, membersRes, snapshotRes] = await Promise.all([
      supabase.from("leagues").select("*").eq("id", id).maybeSingle(),
      supabase.from("league_members").select("*").eq("league_id", id),
      supabase
        .from("standings_snapshots")
        .select("*")
        .eq("league_id", id)
        .eq("is_final", true)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (leagueRes.error) {
      setError(leagueRes.error.message);
      setLoading(false);
      return;
    }
    if (!leagueRes.data) {
      setError("League not found.");
      setLoading(false);
      return;
    }
    setLeague(leagueRes.data);
    setMembers(membersRes.data ?? []);
    setSnapshot(snapshotRes.data);

    if (snapshotRes.data) {
      const { data: authData } = await supabase
        .from("standings_authorizations")
        .select("*")
        .eq("league_id", id)
        .eq("snapshot_id", snapshotRes.data.id);
      setAuthorizations(authData ?? []);
    } else {
      setAuthorizations([]);
    }

    setLoading(false);
  }, [id]);

  // Refetch on focus + tick the countdown every second while the screen is up.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      refetch();
      const tickInterval = setInterval(() => {
        if (!cancelled) setNow(Date.now());
      }, 1000);
      return () => {
        cancelled = true;
        clearInterval(tickInterval);
      };
    }, [refetch]),
  );

  const standings = useMemo<NormalizedStanding[]>(() => {
    return parseStandings(snapshot?.standings ?? null);
  }, [snapshot]);

  const memberById = useMemo(() => {
    const map = new Map<string, LeagueMember>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const myMember = useMemo(() => {
    return members.find(
      (m) => user != null && m.linked_profile_id === user.id,
    ) ?? null;
  }, [members, user]);

  const myAuthorization = useMemo(() => {
    if (!myMember) return null;
    return (
      authorizations.find((a) => a.league_member_id === myMember.id) ?? null
    );
  }, [authorizations, myMember]);

  const counts = useMemo(() => {
    let approved = 0;
    let disputed = 0;
    let pending = 0;
    for (const a of authorizations) {
      if (a.status === "approved") approved++;
      else if (a.status === "disputed") disputed++;
      else pending++;
    }
    return {
      approved,
      disputed,
      pending,
      total: authorizations.length,
    };
  }, [authorizations]);

  const totalPotCents = useMemo(() => {
    if (!league) return 0;
    return (league.buy_in_cents ?? 0) * (league.total_rosters ?? 0);
  }, [league]);

  const projectedPayouts = useMemo(() => {
    if (!league) return [];
    return parseRanks(league.payout_split).map((r) => ({
      rank: r.rank,
      percent: r.percent,
      amountCents: Math.round(totalPotCents * (r.percent / 100)),
      standing: standings.find((s) => s.rank === r.rank) ?? null,
    }));
  }, [league, totalPotCents, standings]);

  const handleVote = useCallback(
    async (decision: Decision) => {
      if (!league || submitting) return;
      if (decision === "disputed" && !disputeReason.trim()) {
        Alert.alert(
          "Tell us what's wrong",
          "Add a short note so the commissioner can sort it out.",
        );
        return;
      }
      setSubmitting(decision);
      try {
        const { data, error } = await supabase.functions.invoke(
          "submit-authorization-vote",
          {
            body: {
              league_id: league.id,
              decision,
              reason: decision === "disputed" ? disputeReason.trim() : undefined,
            },
          },
        );
        if (error) {
          Alert.alert(
            "Couldn't record vote",
            error.message ?? "Try again in a moment.",
          );
          return;
        }
        // Server returns the new league_status + fresh authorization row;
        // simplest is just to refetch so all derived state stays in sync.
        await refetch();
        setShowDispute(false);
        setDisputeReason("");
        // Light feedback if league has now closed. The server auto-fires
        // payouts on closed_authorized; surface the result so the user
        // sees money-out happened, not just the vote landing.
        const result = data as {
          league_status?: string;
          payouts_summary?: {
            payouts: Array<{ status: string; recipient_name: string }>;
          } | null;
          payout_error?: string | null;
        };
        const newStatus = result?.league_status;
        if (newStatus === "closed_authorized") {
          const summary = result.payouts_summary;
          if (summary) {
            const paid = summary.payouts.filter(
              (p) => p.status === "paid",
            ).length;
            const waiting = summary.payouts.filter(
              (p) => p.status === "waiting_on_connect",
            ).length;
            const failed = summary.payouts.filter(
              (p) => p.status === "failed",
            ).length;
            Alert.alert(
              "Standings authorized · Payouts released",
              [
                paid > 0 ? `${paid} paid out` : null,
                waiting > 0
                  ? `${waiting} waiting on Connect onboarding (recipient gets prompted)`
                  : null,
                failed > 0 ? `${failed} failed (commissioner can retry)` : null,
              ]
                .filter(Boolean)
                .join("\n") || "No payouts to send (empty pot).",
            );
          } else if (result.payout_error) {
            Alert.alert(
              "Standings authorized · Payouts couldn't auto-fire",
              `${result.payout_error}\n\nThe commissioner can hit "Send the pot" on the Pot tab to retry.`,
            );
          } else {
            Alert.alert(
              "Standings authorized",
              "All members confirmed — payouts are processing.",
            );
          }
        } else if (newStatus === "closed_disputed") {
          Alert.alert(
            "Dispute raised",
            "The window is paused while the commissioner resolves it.",
          );
        }
      } catch (e) {
        Alert.alert(
          "Couldn't record vote",
          e instanceof Error ? e.message : "Unexpected error.",
        );
      } finally {
        setSubmitting(null);
      }
    },
    [league, submitting, disputeReason, refetch],
  );

  if (loading && !league) {
    return (
      <View className="flex-1 bg-secondary/30">
        <ScreenTopBar title="Verify Final Standings" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (error || !league) {
    return (
      <View className="flex-1 bg-secondary/30">
        <ScreenTopBar title="Verify Final Standings" />
        <View className="flex-1 items-center justify-center gap-2 p-6">
          <FontAwesome name="exclamation-triangle" size={32} color="#f59e0b" />
          <Text className="text-center">{error ?? "League not found."}</Text>
        </View>
      </View>
    );
  }

  // Pre-flight: if no final snapshot, the window can't be opened, so this
  // screen shouldn't be reachable. If it is, render a graceful state instead
  // of showing a half-built view.
  if (!snapshot) {
    return (
      <View className="flex-1 bg-secondary/30">
        <ScreenTopBar title="Verify Final Standings" />
        <View className="flex-1 items-center justify-center gap-3 p-6">
          <FontAwesome name="hourglass-half" size={28} color="#94a3b8" />
          <Text className="text-center font-semibold">
            Standings aren't final yet
          </Text>
          <Text className="text-center text-xs text-muted-foreground">
            Sync from Sleeper after the season completes to open the
            authorization window.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-secondary/30">
      <ScreenTopBar title="Verify Final Standings" />
      <ScrollView contentContainerClassName="p-5 gap-4">
      <CountdownBanner
        closesAt={league.authorization_window_closes_at}
        status={league.authorization_status}
        now={now}
      />

      <ProgressStrip
        approved={counts.approved}
        disputed={counts.disputed}
        total={counts.total}
      />

      <ProjectedPayoutsCard
        projected={projectedPayouts}
        memberById={memberById}
        totalPotCents={totalPotCents}
      />

      <FinalStandingsCard
        standings={standings}
        memberById={memberById}
        currentProfileId={user?.id ?? null}
      />

      {league.authorization_status === "open" && (
        <YourActionCard
          myAuthorization={myAuthorization}
          isLinkedMember={myMember != null}
          submitting={submitting}
          showDispute={showDispute}
          disputeReason={disputeReason}
          onShowDispute={() => setShowDispute(true)}
          onCancelDispute={() => {
            setShowDispute(false);
            setDisputeReason("");
          }}
          onChangeReason={setDisputeReason}
          onApprove={() => handleVote("approved")}
          onDispute={() => handleVote("disputed")}
        />
      )}

      <Text className="text-[11px] text-muted-foreground text-center px-4 pt-2 pb-6">
        When the window closes, payouts will be sent automatically. If a
        dispute is raised, payouts pause until resolved.
      </Text>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Countdown banner
// ============================================================================

function CountdownBanner({
  closesAt,
  status,
  now,
}: {
  closesAt: string | null;
  status: string;
  now: number;
}) {
  if (status === "closed_authorized") {
    return (
      <View className="rounded-2xl bg-green-500/10 border border-green-500/30 p-4 flex-row items-center gap-3">
        <View className="h-9 w-9 rounded-full bg-green-500/20 items-center justify-center">
          <FontAwesome name="check" size={14} color="#22c55e" />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
            Standings authorized
          </Text>
          <Text className="text-xs text-muted-foreground">
            Payouts have been released. Check the Pot tab for live transfer
            status.
          </Text>
        </View>
      </View>
    );
  }

  if (status === "closed_disputed") {
    return (
      <View className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 flex-row items-center gap-3">
        <View className="h-9 w-9 rounded-full bg-amber-500/20 items-center justify-center">
          <FontAwesome name="exclamation-triangle" size={14} color="#f59e0b" />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Dispute raised — frozen
          </Text>
          <Text className="text-xs text-muted-foreground">
            The commissioner needs to resolve this before payouts can run.
          </Text>
        </View>
      </View>
    );
  }

  if (!closesAt) {
    return (
      <View className="rounded-2xl bg-muted p-4">
        <Text className="text-xs text-muted-foreground">
          Authorization window not open yet.
        </Text>
      </View>
    );
  }

  const remainingMs = new Date(closesAt).getTime() - now;
  const expired = remainingMs <= 0;

  return (
    <View className="rounded-2xl bg-foreground p-4 gap-1">
      <Text className="text-[10px] uppercase tracking-wide text-background/70 font-semibold">
        Authorization window
      </Text>
      <Text className="text-3xl font-extrabold tabular-nums text-background">
        {expired ? "00:00:00" : formatRemaining(remainingMs)}
      </Text>
      <Text className="text-xs text-background/70">
        {expired
          ? "Window expired. Auto-close pending."
          : "Closes once everyone votes — or the timer runs out."}
      </Text>
    </View>
  );
}

// ============================================================================
// Progress strip — "10 of 12 members have authorized"
// ============================================================================

function ProgressStrip({
  approved,
  disputed,
  total,
}: {
  approved: number;
  disputed: number;
  total: number;
}) {
  if (total === 0) {
    return null;
  }
  const approvedPct = (approved / total) * 100;
  const disputedPct = (disputed / total) * 100;

  return (
    <View className="rounded-2xl border border-border bg-card p-4 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground font-semibold">
          {approved} of {total} authorized
        </Text>
        {disputed > 0 && (
          <Text className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
            {disputed} disputed
          </Text>
        )}
      </View>
      <View className="h-2 bg-muted rounded-full overflow-hidden flex-row">
        <View
          className="h-full bg-green-500"
          style={{ width: `${approvedPct}%` }}
        />
        <View
          className="h-full bg-amber-500"
          style={{ width: `${disputedPct}%` }}
        />
      </View>
    </View>
  );
}

// ============================================================================
// Projected payouts
// ============================================================================

function ProjectedPayoutsCard({
  projected,
  memberById,
  totalPotCents,
}: {
  projected: Array<{
    rank: number;
    percent: number;
    amountCents: number;
    standing: NormalizedStanding | null;
  }>;
  memberById: Map<string, LeagueMember>;
  totalPotCents: number;
}) {
  if (projected.length === 0) {
    return null;
  }

  return (
    <View className="rounded-2xl border border-border bg-card p-5 gap-3">
      <View>
        <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          Projected payouts
        </Text>
        <Text className="text-2xl font-extrabold mt-0.5">
          {formatCents(totalPotCents)} pot
        </Text>
      </View>
      <View className="gap-2">
        {projected.map(({ rank, amountCents, standing }) => {
          const member = standing?.league_member_id
            ? memberById.get(standing.league_member_id) ?? null
            : null;
          const name = displayNameFor(member, standing);
          return (
            <View
              key={rank}
              className="flex-row items-center gap-3 py-1"
            >
              <View className="h-8 w-8 rounded-full bg-amber-500/15 items-center justify-center">
                <Text className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {rank}
                </Text>
              </View>
              <Text className="flex-1 font-semibold" numberOfLines={1}>
                {name}
              </Text>
              <Text className="text-base font-extrabold tabular-nums">
                {formatCents(amountCents)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================================
// Final standings — locked rendering, no refresh affordance
// ============================================================================

function FinalStandingsCard({
  standings,
  memberById,
  currentProfileId,
}: {
  standings: NormalizedStanding[];
  memberById: Map<string, LeagueMember>;
  currentProfileId: string | null;
}) {
  if (standings.length === 0) return null;

  return (
    <View>
      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2 px-1">
        Final standings
      </Text>
      <View className="rounded-2xl border border-border bg-card overflow-hidden">
        {standings.map((row, i) => {
          const member = row.league_member_id
            ? memberById.get(row.league_member_id) ?? null
            : null;
          const isYou =
            member != null &&
            currentProfileId != null &&
            member.linked_profile_id === currentProfileId;
          const teamName = displayNameFor(member, row);
          const handle =
            member?.external_display_name ?? member?.external_username;
          const subtitle = member?.team_name && handle ? `@${handle}` : null;
          const initial = teamName[0]?.toUpperCase() ?? "?";

          return (
            <View
              key={row.roster_id}
              className={`flex-row items-center gap-3 px-4 py-3 ${
                i === standings.length - 1 ? "" : "border-b border-border"
              } ${isYou ? "bg-green-500/5" : ""}`}
            >
              <View className="h-8 w-8 rounded-full bg-muted items-center justify-center">
                <Text className="text-sm font-bold tabular-nums">
                  {row.rank}
                </Text>
              </View>
              <Avatar alt={teamName} className="h-10 w-10">
                {member?.avatar_url ? (
                  <AvatarImage source={{ uri: member.avatar_url }} />
                ) : null}
                <AvatarFallback>
                  <Text>{initial}</Text>
                </AvatarFallback>
              </Avatar>
              <View className="flex-1 min-w-0">
                <Text className="font-semibold" numberOfLines={1}>
                  {teamName}
                </Text>
                {subtitle && (
                  <Text
                    className="text-xs text-muted-foreground"
                    numberOfLines={1}
                  >
                    {subtitle}
                  </Text>
                )}
              </View>
              <View className="items-end">
                <Text className="text-sm font-bold tabular-nums">
                  {formatRecord(row)}
                </Text>
                <Text className="text-[10px] text-muted-foreground tabular-nums">
                  {row.points_for.toFixed(1)} PF
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================================
// Your action card — vote buttons + dispute reason input
// ============================================================================

function YourActionCard({
  myAuthorization,
  isLinkedMember,
  submitting,
  showDispute,
  disputeReason,
  onShowDispute,
  onCancelDispute,
  onChangeReason,
  onApprove,
  onDispute,
}: {
  myAuthorization: Authorization | null;
  isLinkedMember: boolean;
  submitting: Decision | null;
  showDispute: boolean;
  disputeReason: string;
  onShowDispute: () => void;
  onCancelDispute: () => void;
  onChangeReason: (v: string) => void;
  onApprove: () => void;
  onDispute: () => void;
}) {
  if (!isLinkedMember) {
    // Non-linked viewer (e.g. commissioner peeking, or unlinked Sleeper
    // member). They can read but they can't vote.
    return (
      <View className="rounded-2xl border border-border bg-card p-4">
        <Text className="text-xs text-muted-foreground">
          Only linked members can authorize. Link your account to participate.
        </Text>
      </View>
    );
  }

  if (myAuthorization && myAuthorization.status !== "pending") {
    const approved = myAuthorization.status === "approved";
    return (
      <View
        className={`rounded-2xl border p-4 flex-row items-center gap-3 ${
          approved
            ? "border-green-500/30 bg-green-500/10"
            : "border-amber-500/30 bg-amber-500/10"
        }`}
      >
        <View
          className={`h-9 w-9 rounded-full items-center justify-center ${
            approved ? "bg-green-500/20" : "bg-amber-500/20"
          }`}
        >
          <FontAwesome
            name={approved ? "check" : "exclamation"}
            size={14}
            color={approved ? "#22c55e" : "#f59e0b"}
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold">
            {approved ? "You authorized" : "You raised a dispute"}
          </Text>
          {!approved && myAuthorization.dispute_reason && (
            <Text className="text-xs text-muted-foreground">
              "{myAuthorization.dispute_reason}"
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="rounded-2xl border border-border bg-card p-5 gap-3">
      <View>
        <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          Your call
        </Text>
        <Text className="text-base font-bold mt-1">
          Do these standings look right?
        </Text>
      </View>

      {!showDispute && (
        <View className="gap-2">
          <Pressable
            onPress={onApprove}
            disabled={submitting != null}
            className="rounded-xl bg-green-500 py-3 active:opacity-90 disabled:opacity-60"
          >
            <View className="flex-row items-center justify-center gap-2">
              {submitting === "approved" ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <FontAwesome name="check" size={14} color="#ffffff" />
              )}
              <Text className="text-base font-bold text-white">
                Looks right
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={onShowDispute}
            disabled={submitting != null}
            className="rounded-xl border border-border py-3 active:opacity-80 disabled:opacity-60"
          >
            <View className="flex-row items-center justify-center gap-2">
              <FontAwesome name="exclamation-triangle" size={13} />
              <Text className="text-sm font-semibold">Something's wrong</Text>
            </View>
          </Pressable>
        </View>
      )}

      {showDispute && (
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-xs font-semibold text-muted-foreground">
              What's wrong?
            </Text>
            <TextInput
              value={disputeReason}
              onChangeText={onChangeReason}
              placeholder="e.g. Tiebreaker ranking is off — Steve and Mike are flipped."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              style={{ minHeight: 80, textAlignVertical: "top" }}
              maxLength={1000}
              editable={submitting == null}
            />
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={onCancelDispute}
              disabled={submitting != null}
              className="flex-1 rounded-xl border border-border py-3 active:opacity-80 disabled:opacity-60"
            >
              <Text className="text-sm font-semibold text-center">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onDispute}
              disabled={submitting != null || !disputeReason.trim()}
              className="flex-1 rounded-xl bg-amber-500 py-3 active:opacity-90 disabled:opacity-50"
            >
              <View className="flex-row items-center justify-center gap-2">
                {submitting === "disputed" ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <FontAwesome
                    name="exclamation-triangle"
                    size={13}
                    color="#ffffff"
                  />
                )}
                <Text className="text-sm font-bold text-white">
                  Submit dispute
                </Text>
              </View>
            </Pressable>
          </View>
          <Text className="text-[11px] text-muted-foreground">
            Disputing freezes the league until the commissioner resolves it.
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatCents(cents: number): string {
  if (cents % 100 === 0) return `$${(cents / 100).toFixed(0)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRecord(s: NormalizedStanding): string {
  if (s.ties > 0) return `${s.wins}-${s.losses}-${s.ties}`;
  return `${s.wins}-${s.losses}`;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function displayNameFor(
  member: LeagueMember | null,
  standing: NormalizedStanding | { roster_id: number } | null,
): string {
  if (member) {
    return (
      member.team_name ??
      member.external_display_name ??
      member.external_username ??
      "Unknown"
    );
  }
  if (standing) return `Roster ${standing.roster_id}`;
  return "Unknown";
}

function parseStandings(value: Json | null): NormalizedStanding[] {
  if (!Array.isArray(value)) return [];
  const out: NormalizedStanding[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const rosterId = typeof r.roster_id === "number" ? r.roster_id : null;
    if (rosterId == null) continue;
    out.push({
      rank: typeof r.rank === "number" ? r.rank : 0,
      league_member_id:
        typeof r.league_member_id === "string" ? r.league_member_id : null,
      external_user_id:
        typeof r.external_user_id === "string" ? r.external_user_id : null,
      roster_id: rosterId,
      wins: typeof r.wins === "number" ? r.wins : 0,
      losses: typeof r.losses === "number" ? r.losses : 0,
      ties: typeof r.ties === "number" ? r.ties : 0,
      points_for: typeof r.points_for === "number" ? r.points_for : 0,
      points_against:
        typeof r.points_against === "number" ? r.points_against : 0,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function parseRanks(
  payoutSplit: League["payout_split"],
): Array<{ rank: number; percent: number }> {
  if (
    !payoutSplit ||
    typeof payoutSplit !== "object" ||
    Array.isArray(payoutSplit)
  ) {
    return [];
  }
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
