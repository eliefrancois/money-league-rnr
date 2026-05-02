import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  TouchableOpacity,
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

type BarPartnerBrief = Pick<
  Tables<"bar_partners">,
  "id" | "name" | "default_incentive" | "logo_url"
>;
type League = Tables<"leagues"> & {
  bar_partners?: BarPartnerBrief | null;
};
type LeagueMember = Tables<"league_members">;
type StandingsSnapshot = Tables<"standings_snapshots">;
type Payout = Tables<"payouts">;

// Brand color usage follows the PotKeeper prototype (Downloads/PotKeeper/ml-primitives.jsx).
// Green-500 = brand green, Amber-500 = gold/crown. Layout colors use shadcn
// semantic tokens (bg-card, text-muted-foreground) so dark/light both work.

// Normalized standing row as written by the sync-league-standings Edge Function.
// Mirrors the NormalizedStanding interface in supabase/functions/sync-league-standings/index.ts.
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

type TabKey = "standings" | "pot" | "members";

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [snapshot, setSnapshot] = useState<StandingsSnapshot | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("standings");

  // Reload on every focus so coming back from /buy-in or after a sync shows
  // fresh data without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;

      const load = async () => {
        setLoading(true);
        setError(null);

        const [leagueRes, membersRes, snapshotRes, payoutsRes] =
          await Promise.all([
            supabase.from("leagues").select("*").eq("id", id).maybeSingle(),
            supabase
              .from("league_members")
              .select("*")
              .eq("league_id", id)
              .order("roster_id", { ascending: true, nullsFirst: false }),
            supabase
              .from("standings_snapshots")
              .select("*")
              .eq("league_id", id)
              .order("fetched_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            // Payouts are scoped to the league via RLS. Order by rank so
            // the UI renders 1st, 2nd, 3rd... naturally without a sort.
            supabase
              .from("payouts")
              .select("*")
              .eq("league_id", id)
              .order("rank", { ascending: true, nullsFirst: false }),
          ]);

        if (cancelled) return;

        if (leagueRes.error) {
          setError(leagueRes.error.message);
        } else if (!leagueRes.data) {
          setError("League not found or you don't have access.");
        } else {
          let leagueRow: League = { ...leagueRes.data, bar_partners: null };
          const bpId = leagueRow.bar_partner_id;
          if (bpId != null) {
            const { data: partner, error: bpErr } = await supabase
              .from("bar_partners")
              .select("id, name, default_incentive, logo_url")
              .eq("id", bpId)
              .maybeSingle();
            if (cancelled) return;
            if (!bpErr && partner) {
              leagueRow = { ...leagueRow, bar_partners: partner };
            }
          }
          setLeague(leagueRow);
        }

        if (membersRes.error) {
          setError((prev) => prev ?? membersRes.error.message);
        } else {
          setMembers(membersRes.data ?? []);
        }

        // standings_snapshots may legitimately be empty (league imported,
        // never synced). Don't surface that as an error.
        if (snapshotRes.data) {
          setSnapshot(snapshotRes.data);
        }

        // Payouts is allowed to be empty (pre-trigger leagues). The
        // PotTab uses an empty array as the "trigger CTA visible" signal
        // for closed_authorized leagues, so we always set it.
        if (!payoutsRes.error) {
          setPayouts(payoutsRes.data ?? []);
        }

        setLoading(false);
      };

      load();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  if (loading) {
    return (
      <View className="flex-1 bg-secondary/30">
        <ScreenTopBar title="League" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (error || !league) {
    return (
      <View className="flex-1 bg-secondary/30">
        <ScreenTopBar title="League" />
        <View className="flex-1 items-center justify-center gap-2 p-6">
          <FontAwesome name="exclamation-triangle" size={32} color="#f59e0b" />
          <Text className="text-center">{error ?? "League not found."}</Text>
        </View>
      </View>
    );
  }

  const commissionerMember = members.find((m) => m.is_owner);
  const isCommissioner =
    user != null && league.commissioner_profile_id === user.id;
  const myMember = members.find(
    (m) => user != null && m.linked_profile_id === user.id,
  );

  return (
    <View className="flex-1 bg-secondary/30">
      <ScreenTopBar title={league.name} />
      <ScrollView contentContainerClassName="p-5 gap-4">
        <LeagueHeaderCard
          league={league}
          commissionerMember={commissionerMember}
          memberCount={members.length}
          joinedCount={
            members.filter((m) => m.linked_profile_id != null).length
          }
        />

        <BarPartnerBanner league={league} />

        <AuthorizationBanner league={league} />

        <TabBar value={tab} onChange={setTab} />

        {tab === "standings" && (
          <StandingsTab
            league={league}
            members={members}
            snapshot={snapshot}
            onSnapshotChange={setSnapshot}
            onLeagueChange={setLeague}
            isMember={myMember != null}
            currentProfileId={user?.id ?? null}
          />
        )}
        {tab === "pot" && (
          <PotTab
            league={league}
            members={members}
            snapshot={snapshot}
            payouts={payouts}
            isCommissioner={isCommissioner}
            myMember={myMember}
            commissionerName={
              commissionerMember?.team_name ??
              commissionerMember?.external_display_name ??
              commissionerMember?.external_username ??
              "the commissioner"
            }
            onLeagueChange={setLeague}
            onPayoutsChange={setPayouts}
          />
        )}
        {tab === "members" && (
          <RosterSection
            members={members}
            currentProfileId={user?.id ?? null}
            leagueName={league.name}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Tab bar — segmented control. In-screen state, no nested routes (Pass 1).
// Adding nested routes later is a mechanical refactor if it becomes useful
// for share links or per-tab deep links.
// ============================================================================

const TAB_DEFS: { key: TabKey; label: string }[] = [
  { key: "standings", label: "Standings" },
  { key: "pot", label: "Pot" },
  { key: "members", label: "Members" },
];

function TabBar({
  value,
  onChange,
}: {
  value: TabKey;
  onChange: (next: TabKey) => void;
}) {
  return (
    <View className="rounded-2xl bg-muted p-1 flex-row">
      {TAB_DEFS.map((t) => {
        const active = value === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            activeOpacity={0.7}
            onPress={() => onChange(t.key)}
            className="flex-1"
          >
            <View
              className={`rounded-xl py-2 ${active ? "bg-card" : ""}`}
            >
              <Text
                className={
                  active
                    ? "text-center text-xs font-semibold"
                    : "text-center text-xs font-semibold text-muted-foreground"
                }
              >
                {t.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ============================================================================
// Standings tab
// ============================================================================
//
// Shows the latest snapshot's ranked roster list with refresh pill.
//
// States:
//   1. Never synced (snapshot == null) — empty state with "Sync now" button
//      (members only; non-members see a quiet placeholder).
//   2. Synced — refresh pill at top, ranked list, trophy on payout ranks.
//   3. Refreshing — refresh pill shows spinner.
//
// Trend arrows (week-over-week) need a 2nd snapshot; deferred to Pass 2.
// ============================================================================

function StandingsTab({
  league,
  members,
  snapshot,
  onSnapshotChange,
  onLeagueChange,
  isMember,
  currentProfileId,
}: {
  league: League;
  members: LeagueMember[];
  snapshot: StandingsSnapshot | null;
  onSnapshotChange: (snapshot: StandingsSnapshot) => void;
  onLeagueChange: (league: League) => void;
  isMember: boolean;
  currentProfileId: string | null;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const standings = useMemo<NormalizedStanding[]>(() => {
    return parseStandings(snapshot?.standings ?? null);
  }, [snapshot]);

  const memberById = useMemo(() => {
    const map = new Map<string, LeagueMember>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const payoutRanks = useMemo(() => parsePayoutRanks(league.payout_split), [
    league.payout_split,
  ]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "sync-league-standings",
        { body: { league_id: league.id } },
      );
      if (error) {
        Alert.alert(
          "Couldn't sync standings",
          error.message ?? "Try again in a moment.",
        );
        return;
      }
      const payload = data as {
        snapshot?: StandingsSnapshot;
        auto_authorization?:
          | {
              opened: true;
              snapshot_id: number;
              pending_count: number;
              window_hours: number;
            }
          | { opened: false; reason: string }
          | null;
      };
      const next = payload.snapshot;
      if (next) onSnapshotChange(next);

      // Pass 2B Fix A: the server auto-opens the authorization window the
      // moment a final snapshot lands. Pull the fresh league row so the
      // AuthorizationBanner / Standings rank-medals re-render with the
      // open-window state, and surface a confirming toast.
      const auto = payload.auto_authorization;
      if (auto?.opened) {
        const { data: refreshed } = await supabase
          .from("leagues")
          .select("*")
          .eq("id", league.id)
          .maybeSingle();
        if (refreshed) onLeagueChange(refreshed);
        Alert.alert(
          "Season is final",
          `Authorization window is now open for ${auto.pending_count} ${auto.pending_count === 1 ? "member" : "members"}. ` +
            `Each member has ${auto.window_hours}h to confirm the standings — payouts release the moment all votes are in.`,
        );
      }
    } catch (e) {
      Alert.alert(
        "Couldn't sync standings",
        e instanceof Error ? e.message : "Unexpected error.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [league.id, onLeagueChange, onSnapshotChange, refreshing]);

  // Empty state: no snapshot yet.
  if (snapshot == null) {
    return (
      <View className="rounded-2xl border border-border bg-card p-6 items-center gap-3">
        <View className="h-10 w-10 rounded-full bg-muted items-center justify-center">
          <FontAwesome name="trophy" size={16} color="#94a3b8" />
        </View>
        <Text className="text-center font-semibold">No standings yet</Text>
        <Text className="text-center text-xs text-muted-foreground">
          {isMember
            ? "Pull the latest from Sleeper. We'll cache them so other members don't have to."
            : "Standings will appear here once a league member syncs from Sleeper."}
        </Text>
        {isMember && (
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            className="rounded-full bg-foreground px-4 py-2 active:opacity-80 disabled:opacity-50"
          >
            <View className="flex-row items-center gap-2">
              {refreshing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <FontAwesome name="refresh" size={11} color="#ffffff" />
              )}
              <Text className="text-xs font-semibold text-background">
                {refreshing ? "Syncing..." : "Sync from Sleeper"}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View className="gap-3">
      <RefreshPill
        snapshot={snapshot}
        refreshing={refreshing}
        canRefresh={isMember}
        onPress={handleRefresh}
      />
      <View className="rounded-2xl border border-border bg-card overflow-hidden">
        {standings.map((row, i) => (
          <StandingsRow
            key={row.roster_id}
            standing={row}
            member={
              row.league_member_id
                ? memberById.get(row.league_member_id) ?? null
                : null
            }
            isPayoutSlot={payoutRanks.has(row.rank)}
            isYou={
              row.league_member_id != null &&
              currentProfileId != null &&
              memberById.get(row.league_member_id)?.linked_profile_id ===
                currentProfileId
            }
            isLast={i === standings.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

function RefreshPill({
  snapshot,
  refreshing,
  canRefresh,
  onPress,
}: {
  snapshot: StandingsSnapshot;
  refreshing: boolean;
  canRefresh: boolean;
  onPress: () => void;
}) {
  const ageLabel = formatRelativeTime(snapshot.fetched_at);
  const weekLabel =
    snapshot.current_week != null && snapshot.current_week > 0
      ? `Week ${snapshot.current_week} · `
      : "";

  return (
    <View className="rounded-2xl border border-border bg-card px-4 py-3 flex-row items-center gap-3">
      <View className="h-7 w-7 rounded-full bg-muted items-center justify-center">
        <FontAwesome name="clock-o" size={11} color="#64748b" />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          {snapshot.is_final ? "Final standings" : "Live standings"}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {weekLabel}Synced {ageLabel}
        </Text>
      </View>
      {canRefresh && (
        <Pressable
          onPress={onPress}
          disabled={refreshing}
          hitSlop={8}
          className="rounded-full bg-muted px-3 py-1.5 active:opacity-70 disabled:opacity-50"
        >
          {refreshing ? (
            <ActivityIndicator size="small" />
          ) : (
            <View className="flex-row items-center gap-1.5">
              <FontAwesome name="refresh" size={10} />
              <Text className="text-xs font-semibold">Refresh</Text>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}

function StandingsRow({
  standing,
  member,
  isPayoutSlot,
  isYou,
  isLast,
}: {
  standing: NormalizedStanding;
  member: LeagueMember | null;
  isPayoutSlot: boolean;
  isYou: boolean;
  isLast: boolean;
}) {
  const teamName =
    member?.team_name ??
    member?.external_display_name ??
    member?.external_username ??
    `Roster ${standing.roster_id}`;
  const handle = member?.external_display_name ?? member?.external_username;
  const subtitle = member?.team_name && handle ? `@${handle}` : null;
  const initial = teamName[0]?.toUpperCase() ?? "?";
  const record = formatRecord(standing);

  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3 ${
        isLast ? "" : "border-b border-border"
      } ${isYou ? "bg-green-500/5" : ""}`}
    >
      <RankBadge rank={standing.rank} isPayoutSlot={isPayoutSlot} />
      <Avatar alt={teamName} className="h-10 w-10">
        {member?.avatar_url ? (
          <AvatarImage source={{ uri: member.avatar_url }} />
        ) : null}
        <AvatarFallback>
          <Text>{initial}</Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text className="font-semibold flex-shrink" numberOfLines={1}>
            {teamName}
          </Text>
          {isPayoutSlot && (
            <FontAwesome name="trophy" size={11} color="#f59e0b" />
          )}
        </View>
        {subtitle && (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <View className="items-end">
        <Text className="text-sm font-bold tabular-nums">{record}</Text>
        <Text className="text-[10px] text-muted-foreground tabular-nums">
          {standing.points_for.toFixed(1)} PF
        </Text>
      </View>
    </View>
  );
}

function RankBadge({
  rank,
  isPayoutSlot,
}: {
  rank: number;
  isPayoutSlot: boolean;
}) {
  const bg = isPayoutSlot ? "bg-amber-500/15" : "bg-muted";
  const fg = isPayoutSlot
    ? "text-amber-700 dark:text-amber-400"
    : "text-foreground";
  return (
    <View className={`h-8 w-8 rounded-full items-center justify-center ${bg}`}>
      <Text className={`text-sm font-bold tabular-nums ${fg}`}>{rank}</Text>
    </View>
  );
}

// ============================================================================
// Authorization banner — shown above the tabs whenever the league has an
// active or just-closed authorization window. Drives users to Screen 8.2.
// ============================================================================

function AuthorizationBanner({ league }: { league: League }) {
  if (league.authorization_status === "not_started") return null;

  const isOpen = league.authorization_status === "open";
  const isAuthorized = league.authorization_status === "closed_authorized";
  const isDisputed = league.authorization_status === "closed_disputed";

  const tone = isAuthorized
    ? "border-green-500/30 bg-green-500/10"
    : isDisputed
      ? "border-amber-500/30 bg-amber-500/10"
      : "border-foreground/20 bg-foreground/5";
  const iconColor = isAuthorized
    ? "#22c55e"
    : isDisputed
      ? "#f59e0b"
      : "#0f172a";
  const iconName = isAuthorized
    ? ("check" as const)
    : isDisputed
      ? ("exclamation-triangle" as const)
      : ("clock-o" as const);

  const title = isAuthorized
    ? "Standings authorized"
    : isDisputed
      ? "Dispute raised"
      : "Verify final standings";
  const subtitle = isAuthorized
    ? "All members confirmed."
    : isDisputed
      ? "Frozen until commissioner resolves."
      : league.authorization_window_closes_at
        ? `Window closes ${formatRelativeFuture(league.authorization_window_closes_at)}`
        : "Members are voting now.";

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/league/[id]/authorize",
          params: { id: league.id },
        })
      }
      className="active:opacity-80"
    >
      <View
        className={`rounded-2xl border p-4 flex-row items-center gap-3 ${tone}`}
      >
        <View className="h-9 w-9 rounded-full bg-background/40 items-center justify-center">
          <FontAwesome name={iconName} size={14} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-wide">
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        <FontAwesome name="chevron-right" size={11} color={iconColor} />
      </View>
    </Pressable>
  );
}

// ============================================================================
// Open-authorization CTA — Pot tab. Visible to commissioner only when
// (a) season is final per the latest snapshot, and (b) window not yet open.
// ============================================================================

function OpenAuthorizationCTA({
  league,
  snapshot,
  isCommissioner,
  onWindowOpened,
}: {
  league: League;
  snapshot: StandingsSnapshot | null;
  isCommissioner: boolean;
  onWindowOpened: (updated: League) => void;
}) {
  const [opening, setOpening] = useState(false);

  if (!isCommissioner) return null;
  if (league.authorization_status !== "not_started") return null;
  if (!snapshot?.is_final) return null;

  const handleOpen = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "start-authorization-window",
        { body: { league_id: league.id } },
      );
      if (error) {
        Alert.alert(
          "Couldn't open window",
          error.message ?? "Try again in a moment.",
        );
        return;
      }
      const next = (data as { league?: League }).league;
      if (next) onWindowOpened(next);
      // Send the commissioner straight to Screen 8.2 so they can see the
      // freshly-opened window + their own pending vote.
      router.push({
        pathname: "/league/[id]/authorize",
        params: { id: league.id },
      });
    } catch (e) {
      Alert.alert(
        "Couldn't open window",
        e instanceof Error ? e.message : "Unexpected error.",
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <Pressable onPress={handleOpen} disabled={opening} className="active:opacity-90">
      <View className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 gap-1">
        <View className="flex-row items-center gap-2">
          <FontAwesome name="trophy" size={14} color="#f59e0b" />
          <Text className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Season complete
          </Text>
        </View>
        <Text className="text-base font-extrabold mt-1">
          Open authorization window
        </Text>
        <Text className="text-xs text-muted-foreground">
          Members get 72 hours to confirm the final standings before payouts.
          Pass 2 will fire the payouts automatically; for now this records
          consensus.
        </Text>
        <View className="flex-row items-center gap-1 mt-2">
          {opening ? (
            <ActivityIndicator size="small" />
          ) : (
            <>
              <Text className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Open window
              </Text>
              <FontAwesome name="chevron-right" size={11} color="#f59e0b" />
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ============================================================================
// Buy-in CTA — shown once the commissioner has configured the pot.
// (Unchanged from prior pass; lives in the Pot tab now.)
// ============================================================================

function BuyInCTA({
  league,
  myMember,
}: {
  league: League;
  myMember: LeagueMember | undefined;
}) {
  if (league.buyin_configured_at == null || league.buy_in_cents == null) {
    return null;
  }
  if (!myMember) {
    return null;
  }

  if (myMember.payment_status === "paid") {
    return (
      <View className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 flex-row items-center gap-3">
        <View className="h-9 w-9 rounded-xl items-center justify-center bg-green-500/20">
          <FontAwesome name="check" size={14} color="#22c55e" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold">You're in</Text>
          <Text className="text-[11px] text-muted-foreground">
            Buy-in paid. Held in escrow until season standings finalize.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/league/[id]/buy-in-pay",
          params: { id: league.id },
        })
      }
      className="active:opacity-90"
    >
      <View className="rounded-2xl bg-green-500 p-5 gap-1">
        <View className="flex-row items-center gap-2">
          <FontAwesome name="bolt" size={12} color="#ffffff" />
          <Text className="text-[10px] font-bold uppercase tracking-wide text-white/90">
            Action needed
          </Text>
        </View>
        <Text className="text-base font-extrabold mt-1 text-white">
          Pay your buy-in
        </Text>
        <Text className="text-xs text-white/80">
          {formatCents(league.buy_in_cents)} to enter the pot. You won't be
          locked in until the charge clears.
        </Text>
        <View className="flex-row items-center gap-1 mt-2">
          <Text className="text-sm font-semibold text-white">
            Pay {formatCents(league.buy_in_cents)}
          </Text>
          <FontAwesome name="chevron-right" size={11} color="#ffffff" />
        </View>
      </View>
    </Pressable>
  );
}

// ============================================================================
// Pot tab — the iconic in-season screen (APP_FLOW Tab 6.1.2).
//
// Orchestrates the whole tab so the order/visibility of cards lives in one
// place. Every sub-card is read-only; commissioner-only affordances are
// scoped within the cards (Edit pot, Open authorization).
//
// Pass 1 polish ships the hero/breakdown/payments/trust trio. Deferred:
//   - Ticker animation on pot total change (Lottie polish; Sprint 5)
//   - Sponsorship banners (need leagues.sponsorship_status; Sprint 4 Pass 2)
//   - Pot history line chart (need historical pot_ledger reads; Sprint 5)
// ============================================================================

function PotTab({
  league,
  members,
  snapshot,
  payouts,
  isCommissioner,
  myMember,
  commissionerName,
  onLeagueChange,
  onPayoutsChange,
}: {
  league: League;
  members: LeagueMember[];
  snapshot: StandingsSnapshot | null;
  payouts: Payout[];
  isCommissioner: boolean;
  myMember: LeagueMember | undefined;
  commissionerName: string;
  onLeagueChange: (next: League) => void;
  onPayoutsChange: (next: Payout[]) => void;
}) {
  const buyinConfigured = league.buyin_configured_at != null;

  // Unconfigured: show only the setup CTA / waiting copy. Everything else
  // hides until the commissioner has set the buy-in + split.
  if (!buyinConfigured) {
    return (
      <PotUnconfiguredCard
        league={league}
        isCommissioner={isCommissioner}
        commissionerName={commissionerName}
      />
    );
  }

  // Recipient-side: surface "your payout is waiting" prompts above the
  // breakdown so the user sees their action item first when they open the
  // tab. Filtered to the current user's profile.
  const myWaitingPayout = payouts.find(
    (p) =>
      p.profile_id != null &&
      p.profile_id === myMember?.linked_profile_id &&
      p.status === "waiting_on_connect",
  );

  return (
    <View className="gap-4">
      {myWaitingPayout && (
        <MyPayoutOnboardingCTA
          payout={myWaitingPayout}
          leagueId={league.id}
          onPayoutsChange={onPayoutsChange}
        />
      )}
      <SponsorshipPotBanner league={league} members={members} />
      {isCommissioner && league.sponsorship_status === "none" && (
        <SponsorshipCodeHint leagueId={league.id} />
      )}
      <HeroPotCard league={league} isCommissioner={isCommissioner} />
      {payouts.length === 0 ? (
        <PayoutBreakdownCard
          league={league}
          members={members}
          snapshot={snapshot}
        />
      ) : (
        <PayoutStatusList
          leagueId={league.id}
          payouts={payouts}
          members={members}
          isCommissioner={isCommissioner}
          currentProfileId={myMember?.linked_profile_id ?? null}
          onPayoutsChange={onPayoutsChange}
        />
      )}
      <PaymentStatusCard
        league={league}
        members={members}
        currentProfileId={myMember?.linked_profile_id ?? null}
      />
      <OpenAuthorizationCTA
        league={league}
        snapshot={snapshot}
        isCommissioner={isCommissioner}
        onWindowOpened={onLeagueChange}
      />
      <PayoutTriggerCTA
        league={league}
        snapshot={snapshot}
        payouts={payouts}
        isCommissioner={isCommissioner}
        onPayoutsTriggered={onPayoutsChange}
      />
      <BuyInCTA league={league} myMember={myMember} />
      <TrustFooter league={league} />
    </View>
  );
}

// ============================================================================
// Unconfigured state — set-up CTA for commissioner, muted "waiting" for
// members. Shown only when buyin_configured_at is null.
// ============================================================================

function PotUnconfiguredCard({
  league,
  isCommissioner,
  commissionerName,
}: {
  league: League;
  isCommissioner: boolean;
  commissionerName: string;
}) {
  if (isCommissioner) {
    // Commissioners with no sponsorship attached see the hint inline. Once a
    // code is redeemed (status moves off `none`) the SponsorshipPotBanner
    // takes over up the page, so we don't double up.
    const showSponsorshipHint = league.sponsorship_status === "none";
    return (
      <View className="gap-2">
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/league/[id]/buy-in",
              params: { id: league.id },
            })
          }
          className="active:opacity-90"
        >
          <View className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5 gap-1">
            <View className="flex-row items-center gap-2">
              <FontAwesome name="trophy" size={14} color="#22c55e" />
              <Text className="text-xs font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
                Action needed
              </Text>
            </View>
            <Text className="text-base font-extrabold mt-1">
              Set up the pot
            </Text>
            <Text className="text-xs text-muted-foreground">
              Pick a buy-in, payout split, and fee policy. Members can't pay in
              until you do.
            </Text>
            <View className="flex-row items-center gap-1 mt-2">
              <Text className="text-sm font-semibold text-green-700 dark:text-green-400">
                Get started
              </Text>
              <FontAwesome name="chevron-right" size={11} color="#22c55e" />
            </View>
          </View>
        </Pressable>
        {showSponsorshipHint && <SponsorshipCodeHint leagueId={league.id} />}
      </View>
    );
  }
  return (
    <View className="rounded-2xl border border-border bg-card p-4">
      <Text className="text-xs text-muted-foreground">
        Waiting on {commissionerName} to set up the pot. We'll let you know
        when buy-in is ready.
      </Text>
    </View>
  );
}

// ============================================================================
// SponsorshipCodeHint — small affordance pointing commissioners to the
// buy-in screen where the actual sponsorship code entry lives. Surfaced
// from any "you haven't set the pot up yet" entry point so commissioners
// who got a code from a partner know where to apply it. Single source of
// truth for redemption stays in `buy-in.tsx` (`SponsorshipSetupSection`).
// ============================================================================

function SponsorshipCodeHint({ leagueId }: { leagueId: string }) {
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/league/[id]/buy-in",
          params: { id: leagueId },
        })
      }
      className="active:opacity-80"
    >
      <View className="rounded-2xl border border-dashed border-sky-500/40 bg-sky-500/5 p-3 flex-row items-center gap-3">
        <View className="h-8 w-8 rounded-full bg-sky-500/15 items-center justify-center">
          <FontAwesome name="ticket" size={13} color="#0ea5e9" />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-semibold text-foreground">
            Have a sponsorship code?
          </Text>
          <Text className="text-[11px] text-muted-foreground">
            Apply it during buy-in setup to add a partner-funded boost.
          </Text>
        </View>
        <FontAwesome name="chevron-right" size={11} color="#94a3b8" />
      </View>
    </Pressable>
  );
}

// ============================================================================
// Hero pot card — the iconic $ figure. Big, tabular, prominent. Trust
// microcopy directly on the card so the user sees "held in escrow" with the
// money figure (per BRAND.md "every money screen carries a trust signal").
// ============================================================================

function HeroPotCard({
  league,
  isCommissioner,
}: {
  league: League;
  isCommissioner: boolean;
}) {
  const buyIn = league.buy_in_cents ?? 0;
  const totalRosters = league.total_rosters ?? 0;
  const totalPotCents = buyIn * totalRosters;

  return (
    <View className="rounded-3xl border border-border bg-card p-6 gap-3">
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            The pot
          </Text>
          <Text className="text-5xl font-black tabular-nums tracking-tight mt-1">
            {formatCents(totalPotCents)}
          </Text>
          <Text className="text-xs text-muted-foreground mt-1">
            {formatCents(buyIn)} × {totalRosters} teams
          </Text>
        </View>
        {isCommissioner && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/league/[id]/buy-in",
                params: { id: league.id },
              })
            }
            className="rounded-full bg-muted px-3 py-1.5 active:opacity-70"
          >
            <View className="flex-row items-center gap-1.5">
              <FontAwesome name="pencil" size={11} />
              <Text className="text-xs font-semibold">Edit</Text>
            </View>
          </Pressable>
        )}
      </View>

      <View className="flex-row items-center gap-2 border-t border-border pt-3">
        <View className="h-6 w-6 rounded-full bg-green-500/15 items-center justify-center">
          <FontAwesome name="lock" size={10} color="#22c55e" />
        </View>
        <Text className="text-[11px] text-muted-foreground flex-1">
          Held in PotKeeper Stripe escrow until standings finalize.
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// Payout breakdown — stacked bar visualization + per-rank member assignment.
//
// Member assignment uses the latest standings snapshot when available. For
// pre-season / unsynced leagues we just show "—" with a hint to sync.
// ============================================================================

function PayoutBreakdownCard({
  league,
  members,
  snapshot,
}: {
  league: League;
  members: LeagueMember[];
  snapshot: StandingsSnapshot | null;
}) {
  const buyIn = league.buy_in_cents ?? 0;
  const totalRosters = league.total_rosters ?? 0;
  const totalPotCents = buyIn * totalRosters;
  const ranks = parseRanks(league.payout_split);

  const standings = useMemo<NormalizedStanding[]>(() => {
    return parseStandings(snapshot?.standings ?? null);
  }, [snapshot]);

  const memberById = useMemo(() => {
    const map = new Map<string, LeagueMember>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  if (ranks.length === 0) return null;

  // Brand palette: 1st = green, 2nd = lighter green, 3rd = amber, 4+ = muted.
  // Keeps the bar visually weighted toward the winner without going garish.
  const segmentColors = [
    "#22c55e",
    "#86efac",
    "#f59e0b",
    "#94a3b8",
    "#cbd5e1",
  ];

  return (
    <View className="rounded-2xl border border-border bg-card p-5 gap-4">
      <View>
        <Text className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Where the money goes
        </Text>
        <Text className="text-xs text-muted-foreground mt-0.5">
          {snapshot
            ? snapshot.is_final
              ? "Based on final standings."
              : `Based on standings as of ${formatRelativeTime(snapshot.fetched_at)}.`
            : "Awaits a standings sync."}
        </Text>
      </View>

      {/* Stacked bar */}
      <View className="h-2 rounded-full bg-muted overflow-hidden flex-row">
        {ranks.map(({ rank, percent }, i) => (
          <View
            key={rank}
            style={{
              width: `${percent}%`,
              backgroundColor: segmentColors[i] ?? segmentColors[segmentColors.length - 1],
            }}
          />
        ))}
      </View>

      <View className="gap-2">
        {ranks.map(({ rank, percent }) => {
          const standing = standings.find((s) => s.rank === rank);
          const member = standing?.league_member_id
            ? memberById.get(standing.league_member_id) ?? null
            : null;
          const name = standing
            ? displayMemberName(member, standing)
            : null;
          const amount = Math.round(totalPotCents * (percent / 100));
          return (
            <View
              key={rank}
              className="flex-row items-center gap-3 py-1"
            >
              <RankMedal rank={rank} />
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-semibold" numberOfLines={1}>
                  {name ?? rankLabel(rank)}
                </Text>
                <Text className="text-[11px] text-muted-foreground">
                  {percent}% of pot
                </Text>
              </View>
              <Text className="text-base font-extrabold tabular-nums">
                {formatCents(amount)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Small medal icon used in the breakdown card. Gold for 1st-3rd, muted for
// the rest. Keeps the rank visually distinct without inflating the row.
function RankMedal({ rank }: { rank: number }) {
  const isPodium = rank <= 3;
  const bg = isPodium ? "bg-amber-500/15" : "bg-muted";
  const fg = isPodium
    ? "text-amber-700 dark:text-amber-400"
    : "text-foreground";
  return (
    <View
      className={`h-9 w-9 rounded-full items-center justify-center ${bg}`}
    >
      {rank === 1 ? (
        <FontAwesome name="trophy" size={14} color="#f59e0b" />
      ) : (
        <Text className={`text-sm font-extrabold tabular-nums ${fg}`}>
          {rank}
        </Text>
      )}
    </View>
  );
}

// ============================================================================
// Payment status — paid count + per-member list with status pill.
// Spec: members see all (small leagues, transparency matters); commissioner
// sees the same list. We dedupe to linked members + commissioner row to
// avoid showing rosters that can never pay.
// ============================================================================

function PaymentStatusCard({
  league,
  members,
  currentProfileId,
}: {
  league: League;
  members: LeagueMember[];
  currentProfileId: string | null;
}) {
  // We surface payment status for every league_member row that is linked
  // (can pay) OR is the commissioner (the commissioner row is created at
  // import time and serves as the visible "head" of the league even if
  // they're not yet linked — though in practice they always are, since
  // they did the import). Other unlinked members can't pay, so we hide
  // them to avoid a permanent "Pending" row that's confusing.
  const visibleMembers = useMemo(() => {
    return members.filter(
      (m) => m.linked_profile_id != null || m.is_owner,
    );
  }, [members]);

  const paidCount = useMemo(() => {
    return visibleMembers.filter((m) => m.payment_status === "paid").length;
  }, [visibleMembers]);

  if (visibleMembers.length === 0) return null;
  // Bail if the league hasn't been buy-in-configured yet — payment status
  // is meaningless then.
  if (league.buyin_configured_at == null) return null;

  return (
    <View className="rounded-2xl border border-border bg-card p-5 gap-3">
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Payments
          </Text>
          <Text className="text-2xl font-extrabold mt-0.5 tabular-nums">
            {paidCount} <Text className="text-muted-foreground">/</Text>{" "}
            {visibleMembers.length}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground">paid</Text>
      </View>
      <View className="border-t border-border pt-3 gap-2">
        {visibleMembers.map((m) => {
          const name =
            m.team_name ??
            m.external_display_name ??
            m.external_username ??
            "Unknown";
          const isYou =
            currentProfileId != null && m.linked_profile_id === currentProfileId;
          const paid = m.payment_status === "paid";
          return (
            <View
              key={m.id}
              className="flex-row items-center gap-2 py-0.5"
            >
              <View
                className={`h-6 w-6 rounded-full items-center justify-center ${
                  paid ? "bg-green-500/15" : "bg-muted"
                }`}
              >
                <FontAwesome
                  name={paid ? "check" : "clock-o"}
                  size={10}
                  color={paid ? "#22c55e" : "#94a3b8"}
                />
              </View>
              <Text
                className="flex-1 text-sm"
                numberOfLines={1}
              >
                {name}
                {isYou && (
                  <Text className="text-muted-foreground"> (you)</Text>
                )}
              </Text>
              <Text
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  paid
                    ? "text-green-700 dark:text-green-400"
                    : "text-muted-foreground"
                }`}
              >
                {paid ? "Paid" : "Pending"}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================================
// Trust footer — anchors the Pot tab with the escrow + fee disclosure.
// ============================================================================

function TrustFooter({ league }: { league: League }) {
  const feeCopy =
    league.fee_payer === "commissioner"
      ? "Commissioner covers the 2.5% PotKeeper fee."
      : "Members cover the 2.5% PotKeeper fee.";
  return (
    <View className="rounded-2xl bg-muted/40 px-4 py-3 gap-1">
      <View className="flex-row items-center gap-2">
        <FontAwesome name="shield" size={11} color="#94a3b8" />
        <Text className="text-[11px] text-muted-foreground flex-1">
          PotKeeper holds your buy-ins in a Stripe-managed escrow account.
          We never touch your bank login, and payouts only release once the
          league authorizes the final standings.
        </Text>
      </View>
      <Text className="text-[10px] text-muted-foreground pl-5">{feeCopy}</Text>
    </View>
  );
}

// ============================================================================
// Payout trigger CTA — commissioner-only. Visible after standings are
// authorized but before any payouts have been triggered. One tap opens a
// confirm dialog, then fires trigger-payout.
// ============================================================================

function PayoutTriggerCTA({
  league,
  snapshot,
  payouts,
  isCommissioner,
  onPayoutsTriggered,
}: {
  league: League;
  snapshot: StandingsSnapshot | null;
  payouts: Payout[];
  isCommissioner: boolean;
  onPayoutsTriggered: (next: Payout[]) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  // Visibility gate: commissioner only, league must be authorized, must
  // have a final snapshot, and no payouts can have been triggered yet.
  if (!isCommissioner) return null;
  if (league.authorization_status !== "closed_authorized") return null;
  if (!snapshot?.is_final) return null;
  if (payouts.length > 0) return null;

  const handlePress = () => {
    Alert.alert(
      "Send the pot?",
      "This will release the pot to the winners' Stripe accounts. The 2.5% PotKeeper fee comes off the top. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send payouts",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            try {
              const { data, error } = await supabase.functions.invoke(
                "trigger-payout",
                { body: { league_id: league.id } },
              );
              if (error) throw error;
              const summary = data as {
                pot_cents: number;
                fee_cents: number;
                payouts: Array<{ status: string; recipient_name: string }>;
              };

              // Refetch payouts so the list renders fresh state. The
              // edge function returns a summary but we want the full row
              // shapes for downstream UI (status pills, transfer ids,
              // failure reasons).
              const { data: refreshed } = await supabase
                .from("payouts")
                .select("*")
                .eq("league_id", league.id)
                .order("rank", { ascending: true, nullsFirst: false });
              onPayoutsTriggered(refreshed ?? []);

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
                "Payouts triggered",
                [
                  `${paid} paid`,
                  waiting > 0 ? `${waiting} waiting on Connect onboarding` : null,
                  failed > 0 ? `${failed} failed (see status list)` : null,
                ]
                  .filter(Boolean)
                  .join("\n"),
              );
            } catch (e) {
              const message =
                e instanceof Error ? e.message : "Couldn't trigger payouts.";
              Alert.alert("Payout failed", message);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={submitting}
      className="active:opacity-90"
    >
      <View className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5 gap-1">
        <View className="flex-row items-center gap-2">
          <FontAwesome name="trophy" size={14} color="#22c55e" />
          <Text className="text-xs font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
            Ready to pay out
          </Text>
        </View>
        <Text className="text-base font-extrabold mt-1">
          Send the pot to the winners
        </Text>
        <Text className="text-xs text-muted-foreground">
          Standings are authorized. Tap to release funds via Stripe Connect.
          Recipients without onboarded Connect accounts will see a "claim your
          winnings" prompt and you can retry from this screen.
        </Text>
        <View className="flex-row items-center gap-1 mt-2">
          {submitting ? (
            <ActivityIndicator size="small" color="#22c55e" />
          ) : (
            <>
              <Text className="text-sm font-semibold text-green-700 dark:text-green-400">
                Send payouts
              </Text>
              <FontAwesome name="chevron-right" size={11} color="#22c55e" />
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ============================================================================
// Payout status list — once payouts exist, replaces the projected
// breakdown card. Shows the actual recipient + status per rank.
// ============================================================================

function PayoutStatusList({
  leagueId,
  payouts,
  members,
  isCommissioner,
  currentProfileId,
  onPayoutsChange,
}: {
  leagueId: string;
  payouts: Payout[];
  members: LeagueMember[];
  isCommissioner: boolean;
  currentProfileId: string | null;
  onPayoutsChange: (next: Payout[]) => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const memberById = useMemo(() => {
    const map = new Map<string, LeagueMember>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  // Sort rank=null (charity) to the bottom; otherwise rank ascending.
  const sorted = useMemo(() => {
    return [...payouts].sort((a, b) => {
      if (a.rank == null && b.rank == null) return 0;
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return a.rank - b.rank;
    });
  }, [payouts]);

  // Retry CTA visibility: any row in `waiting_on_connect` or `failed`. The
  // commissioner sees a single "Retry payouts" button; recipient self-serve
  // happens through MyPayoutOnboardingCTA (above the list).
  const hasRetriable = useMemo(
    () => payouts.some((p) => p.status === "waiting_on_connect" || p.status === "failed"),
    [payouts],
  );

  const handleRetryAll = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke("retry-payout", {
        body: { league_id: leagueId },
      });
      if (error) {
        Alert.alert(
          "Couldn't retry payouts",
          error.message ?? "Try again in a moment.",
        );
        return;
      }
      const summary = data as {
        retried?: { status: string }[];
        skipped?: { reason: string }[];
      };
      const paidNow = summary.retried?.filter((r) => r.status === "paid").length ?? 0;
      const stillWaiting = summary.skipped?.length ?? 0;
      const stillFailed = summary.retried?.filter((r) => r.status === "failed").length ?? 0;
      const { data: refreshed } = await supabase
        .from("payouts")
        .select("*")
        .eq("league_id", leagueId)
        .order("rank", { ascending: true, nullsFirst: false });
      if (refreshed) onPayoutsChange(refreshed as Payout[]);
      Alert.alert(
        "Retry complete",
        `${paidNow} paid · ${stillWaiting} still waiting on Connect · ${stillFailed} still failing.`,
      );
    } catch (e) {
      Alert.alert(
        "Couldn't retry payouts",
        e instanceof Error ? e.message : "Unexpected error.",
      );
    } finally {
      setRetrying(false);
    }
  }, [leagueId, onPayoutsChange, retrying]);

  return (
    <View className="rounded-2xl border border-border bg-card p-5 gap-3">
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Payouts
          </Text>
          <Text className="text-xs text-muted-foreground mt-0.5">
            Live status from Stripe.
          </Text>
        </View>
        {isCommissioner && hasRetriable && (
          <Pressable
            onPress={handleRetryAll}
            disabled={retrying}
            className="rounded-full bg-foreground px-3 py-1.5 active:opacity-80 disabled:opacity-50"
            accessibilityLabel="Retry pending payouts"
          >
            <View className="flex-row items-center gap-1.5">
              {retrying ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <FontAwesome name="refresh" size={10} color="#ffffff" />
              )}
              <Text className="text-[11px] font-semibold text-background">
                {retrying ? "Retrying..." : "Retry"}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
      <View className="gap-2 border-t border-border pt-3">
        {sorted.map((p) => {
          const member = p.league_member_id
            ? memberById.get(p.league_member_id) ?? null
            : null;
          const name =
            member?.team_name ??
            member?.external_display_name ??
            member?.external_username ??
            (p.recipient_kind === "charity" ? "Charity" : "Unknown");
          const isYou =
            currentProfileId != null && p.profile_id === currentProfileId;
          return (
            <View
              key={p.id}
              className="flex-row items-center gap-3 py-1"
            >
              {p.rank != null ? (
                <RankMedal rank={p.rank} />
              ) : (
                <View className="h-9 w-9 rounded-full items-center justify-center bg-muted">
                  <FontAwesome name="heart" size={12} color="#94a3b8" />
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-semibold" numberOfLines={1}>
                  {name}
                  {isYou && (
                    <Text className="text-muted-foreground"> (you)</Text>
                  )}
                </Text>
                <PayoutStatusPill
                  status={p.status}
                  failureReason={p.failure_reason}
                />
              </View>
              <Text className="text-base font-extrabold tabular-nums">
                {formatCents(p.amount_cents)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PayoutStatusPill({
  status,
  failureReason,
}: {
  status: string;
  failureReason: string | null;
}) {
  const meta = (() => {
    switch (status) {
      case "paid":
        return { label: "Paid", color: "text-green-700 dark:text-green-400" };
      case "processing":
        return {
          label: "Processing",
          color: "text-amber-700 dark:text-amber-400",
        };
      case "reserved":
        return {
          label: "Held (5% · releases after window)",
          color: "text-sky-700 dark:text-sky-400",
        };
      case "waiting_on_connect":
        return {
          label: "Waiting on Connect onboarding",
          color: "text-amber-700 dark:text-amber-400",
        };
      case "failed":
        return {
          label: failureReason ? `Failed · ${failureReason}` : "Failed",
          color: "text-red-700 dark:text-red-400",
        };
      case "reversed":
        return {
          label: "Reversed",
          color: "text-red-700 dark:text-red-400",
        };
      default:
        return { label: status, color: "text-muted-foreground" };
    }
  })();
  return (
    <Text
      className={`text-[11px] font-semibold ${meta.color}`}
      numberOfLines={1}
    >
      {meta.label}
    </Text>
  );
}

// ============================================================================
// MyPayoutOnboardingCTA — recipient sees this when their payout is queued
// but they haven't finished Stripe Connect onboarding yet. Drives them to
// the wallet onboarding flow.
// ============================================================================

function MyPayoutOnboardingCTA({
  payout,
  leagueId,
  onPayoutsChange,
}: {
  payout: Payout;
  leagueId: string;
  onPayoutsChange: (next: Payout[]) => void;
}) {
  const [releasing, setReleasing] = useState(false);

  const handleRelease = useCallback(async () => {
    if (releasing) return;
    setReleasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("retry-payout", {
        body: { league_id: leagueId, payout_id: payout.id },
      });
      if (error) {
        Alert.alert(
          "Couldn't release payout",
          error.message ?? "Finish onboarding first, then try again.",
        );
        return;
      }
      const summary = data as {
        retried?: { status: string }[];
        skipped?: { reason: string }[];
      };
      const paidNow = summary.retried?.find((r) => r.status === "paid");
      const stillWaiting = (summary.skipped?.length ?? 0) > 0;
      const { data: refreshed } = await supabase
        .from("payouts")
        .select("*")
        .eq("league_id", leagueId)
        .order("rank", { ascending: true, nullsFirst: false });
      if (refreshed) onPayoutsChange(refreshed as Payout[]);
      if (paidNow) {
        Alert.alert(
          "Payout released",
          `${formatCents(payout.amount_cents)} is on its way to your bank.`,
        );
      } else if (stillWaiting) {
        Alert.alert(
          "Almost there",
          "Finish your Stripe Connect onboarding from the Wallet, then tap Release again.",
        );
      } else {
        Alert.alert(
          "Couldn't release yet",
          "Stripe rejected the transfer. Open Wallet to check onboarding status.",
        );
      }
    } catch (e) {
      Alert.alert(
        "Couldn't release payout",
        e instanceof Error ? e.message : "Unexpected error.",
      );
    } finally {
      setReleasing(false);
    }
  }, [leagueId, onPayoutsChange, payout.amount_cents, payout.id, releasing]);

  return (
    <View className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 gap-2">
      <View className="flex-row items-center gap-2">
        <FontAwesome name="trophy" size={14} color="#f59e0b" />
        <Text className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          Action needed
        </Text>
      </View>
      <Text className="text-base font-extrabold">
        Claim your {formatCents(payout.amount_cents)} in winnings
      </Text>
      <Text className="text-xs text-muted-foreground">
        Finish Stripe Connect onboarding so we can release the funds to your
        bank. Takes about 2 minutes.
      </Text>
      <View className="flex-row items-center gap-2 mt-1">
        <Pressable
          onPress={() => router.push("/wallet")}
          className="flex-1 rounded-full bg-amber-500 px-4 py-2.5 active:opacity-90"
          accessibilityLabel="Open wallet to finish onboarding"
        >
          <Text className="text-sm font-semibold text-white text-center">
            Open wallet
          </Text>
        </Pressable>
        <Pressable
          onPress={handleRelease}
          disabled={releasing}
          className="flex-1 rounded-full border border-amber-500 px-4 py-2.5 active:opacity-80 disabled:opacity-50"
          accessibilityLabel="Release my payout"
        >
          <View className="flex-row items-center justify-center gap-1.5">
            {releasing && <ActivityIndicator size="small" color="#f59e0b" />}
            <Text className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {releasing ? "Releasing..." : "Release now"}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

// ============================================================================
// Pass 2C: bar partner (display-only) + sponsorship pot messaging.
// ============================================================================

function BarPartnerBanner({ league }: { league: League }) {
  if (league.bar_partner_id == null) return null;
  const partner = league.bar_partners;
  if (!partner) return null;
  const copy =
    league.bar_incentive_text?.trim() ||
    partner.default_incentive?.trim() ||
    null;
  if (!copy) return null;
  return (
    <View className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 gap-1">
      <Text className="text-[10px] uppercase tracking-wide font-semibold text-amber-800 dark:text-amber-400">
        Bar partner
      </Text>
      <Text className="text-base font-extrabold">{partner.name}</Text>
      <Text className="text-sm text-muted-foreground">{copy}</Text>
    </View>
  );
}

// `get_sponsorship_view` (migration 20260502000017) shape — service-role-safe
// projection fields that clients can use for the Pot tab banner without
// reading `sponsorship_codes` directly.
type SponsorshipView = {
  status: string;
  boost_max_cents: number;
  match_ratio: number;
  expires_at: string | null;
  min_members_paid_pct: number;
  funded_at: string | null;
  partner_name: string;
};

type SponsorshipPotMath = {
  memberPaidCents: number;
  sponsorshipCreditedCents: number;
};

function SponsorshipPotBanner({
  league,
  members,
}: {
  league: League;
  members: LeagueMember[];
}) {
  const [meta, setMeta] = useState<SponsorshipView | null>(null);
  const [pot, setPot] = useState<SponsorshipPotMath | null>(null);

  // Pull RPC meta + materialized-view math whenever sponsorship is live.
  // The RPC is gated by league membership; the MV exposes the public-safe
  // pot rollups we need for the projection (member_paid_cents,
  // sponsorship_credited_cents).
  useEffect(() => {
    if (
      league.sponsorship_status !== "redeemed_pending" &&
      league.sponsorship_status !== "funded"
    ) {
      setMeta(null);
      setPot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: viewRows }, { data: balRow }] = await Promise.all([
        supabase
          .rpc("get_sponsorship_view", { p_league_id: league.id })
          .returns<SponsorshipView[]>(),
        supabase
          .from("league_pot_balance")
          .select("member_paid_cents, sponsorship_credited_cents")
          .eq("league_id", league.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const view = Array.isArray(viewRows) ? viewRows[0] : null;
      if (view) setMeta(view);
      if (balRow) {
        setPot({
          memberPaidCents: Number(balRow.member_paid_cents ?? 0),
          sponsorshipCreditedCents: Number(balRow.sponsorship_credited_cents ?? 0),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [league.id, league.sponsorship_status]);

  // Mirrors `sponsorship-boost-tick` cron's denominator (linked-or-owner)
  // so the on-screen progress bar matches the threshold the cron evaluates.
  const visibleMembers = useMemo(
    () => members.filter((m) => m.linked_profile_id != null || m.is_owner),
    [members],
  );
  const paidCount = useMemo(
    () => visibleMembers.filter((m) => m.payment_status === "paid").length,
    [visibleMembers],
  );

  if (league.sponsorship_status === "none") return null;

  if (league.sponsorship_status === "forfeited") {
    return (
      <View className="rounded-2xl border border-border bg-muted/40 p-3">
        <Text className="text-xs text-muted-foreground">
          A sponsorship code did not unlock in time and no longer applies.
        </Text>
      </View>
    );
  }

  // `boost_max_cents` is denormalized onto leagues at redemption time, so it's
  // safe to fall back to it before the RPC resolves.
  const boostMax = meta?.boost_max_cents ?? league.sponsorship_boost_max_cents ?? 0;
  const matchRatio = Number(meta?.match_ratio ?? 1) || 1;
  const minPaidPct = Number(meta?.min_members_paid_pct ?? 0.8) || 0.8;
  const partnerName = meta?.partner_name ?? "Partner";

  if (league.sponsorship_status === "funded") {
    const credited = pot?.sponsorshipCreditedCents ?? 0;
    return (
      <View className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 gap-1">
        <Text className="text-[10px] uppercase tracking-wide font-semibold text-green-700 dark:text-green-400">
          {partnerName === "Partner" ? "Sponsorship credited" : `${partnerName} · credited`}
        </Text>
        <Text className="text-3xl font-black tabular-nums tracking-tight text-foreground">
          {formatCents(credited)}
        </Text>
        <Text className="text-[11px] text-muted-foreground">
          Already added to the pot. Counts toward winner payouts when standings finalize.
        </Text>
      </View>
    );
  }

  // redeemed_pending — show the live projection.
  const memberPaidCents = pot?.memberPaidCents ?? 0;
  const projectedBoost = Math.min(
    Math.max(0, Math.floor(memberPaidCents * matchRatio)),
    boostMax,
  );
  const visibleCount = visibleMembers.length;
  const requiredPaid = Math.max(1, Math.ceil(visibleCount * minPaidPct));
  const paidShortfall = Math.max(0, requiredPaid - paidCount);
  const paidProgressPct = visibleCount > 0
    ? Math.min(100, Math.round((paidCount / requiredPaid) * 100))
    : 0;
  const expiresAt = meta?.expires_at ? new Date(meta.expires_at) : null;
  const expiresInDays = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const expired = expiresAt != null && expiresAt.getTime() <= Date.now();

  return (
    <View className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[10px] uppercase tracking-wide font-semibold text-sky-800 dark:text-sky-400">
            {partnerName === "Partner" ? "Sponsorship boost (pending)" : `${partnerName} · pending boost`}
          </Text>
          <Text className="text-3xl font-black tabular-nums tracking-tight text-foreground mt-1">
            {formatCents(projectedBoost)}
          </Text>
          <Text className="text-[11px] text-muted-foreground mt-0.5">
            Projected · cap {formatCents(boostMax)}
            {matchRatio !== 1 ? ` · ${matchRatio.toFixed(2)}× match` : ""}
          </Text>
        </View>
        {expiresInDays != null && !expired && (
          <View className="rounded-full bg-sky-500/10 px-2.5 py-1">
            <Text className="text-[10px] font-semibold text-sky-700 dark:text-sky-400">
              {expiresInDays === 0 ? "Expires today" : `${expiresInDays}d left`}
            </Text>
          </View>
        )}
        {expired && (
          <View className="rounded-full bg-amber-500/15 px-2.5 py-1">
            <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              Expired
            </Text>
          </View>
        )}
      </View>

      {visibleCount > 0 && (
        <View className="gap-1.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] text-muted-foreground">
              Paid members
            </Text>
            <Text className="text-[11px] font-semibold tabular-nums text-foreground">
              {paidCount} / {requiredPaid} needed
            </Text>
          </View>
          <View className="h-1.5 rounded-full bg-muted overflow-hidden">
            <View
              className="h-1.5 rounded-full bg-sky-500"
              style={{ width: `${paidProgressPct}%` }}
            />
          </View>
        </View>
      )}

      <Text className="text-[11px] text-muted-foreground">
        {expired
          ? "This code passed its expiration before unlocking. The next boost cron will mark it forfeited."
          : paidShortfall === 0
            ? projectedBoost > 0
              ? "Threshold met — funds credit on the next sponsorship cron run."
              : "Threshold met — boost will credit once members start paying in."
            : `${paidShortfall} more paid member${paidShortfall === 1 ? "" : "s"} unlocks the boost.`}
      </Text>
    </View>
  );
}

// ============================================================================
// League header card (always visible above tabs).
// ============================================================================

function LeagueHeaderCard({
  league,
  commissionerMember,
  memberCount,
  joinedCount,
}: {
  league: League;
  commissionerMember: LeagueMember | undefined;
  memberCount: number;
  joinedCount: number;
}) {
  const platformLabel =
    league.platform.charAt(0).toUpperCase() + league.platform.slice(1);
  const statusBadge = formatLeagueStatus(league.status);
  const commissionerName =
    commissionerMember?.team_name ??
    commissionerMember?.external_display_name ??
    commissionerMember?.external_username ??
    "Unknown";
  const commissionerOnPotKeeper = commissionerMember?.linked_profile_id != null;

  // Top bar carries the league name now; this card focuses on metadata
  // (season + platform + status pill) and the at-a-glance stats below it.
  return (
    <View className="rounded-2xl border border-border bg-card p-5 gap-4">
      <View className="flex-row items-center gap-2 flex-wrap">
        <Text className="text-xs text-muted-foreground">
          {league.season} · {platformLabel}
        </Text>
        {statusBadge && <StatusPill label={statusBadge} />}
      </View>

      <View className="flex-row gap-6">
        <Stat label="Rosters" value={String(league.total_rosters ?? "?")} />
        <MembersStat joined={joinedCount} total={memberCount} />
        <Stat
          label="Buy-in"
          value={
            league.buy_in_cents != null
              ? formatCents(league.buy_in_cents)
              : "—"
          }
        />
      </View>

      <View className="flex-row items-center gap-3 border-t border-border pt-4">
        <View className="h-9 w-9 rounded-full bg-amber-500/15 items-center justify-center">
          <FontAwesome name="star" size={14} color="#f59e0b" />
        </View>
        <View className="flex-1">
          <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Commissioner
          </Text>
          <Text className="font-semibold">{commissionerName}</Text>
          {!commissionerOnPotKeeper && (
            <Text className="text-[11px] text-muted-foreground">
              Not on PotKeeper yet
            </Text>
          )}
        </View>
        {!commissionerOnPotKeeper && (
          <Pressable
            onPress={() =>
              shareLeagueInvite({
                recipientLabel: commissionerName,
                leagueName: league.name,
                isCommissionerInvite: true,
              })
            }
            className="rounded-full bg-amber-500/15 px-3 py-1.5 active:opacity-70"
          >
            <View className="flex-row items-center gap-1.5">
              <FontAwesome name="share" size={11} color="#f59e0b" />
              <Text className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Invite
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// Members stat with PotKeeper coverage. Numerator color signals at-a-glance
// how many members have actually joined: green when the league is fully on
// PotKeeper, amber for partial, red when nobody else has signed up yet.
// The fraction is dense but readable; the sub-label spells it out.
function MembersStat({ joined, total }: { joined: number; total: number }) {
  const tone =
    total === 0 || joined === 0
      ? "red"
      : joined >= total
        ? "green"
        : "amber";
  const numeratorColor =
    tone === "green"
      ? "text-green-600 dark:text-green-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  const dotColor =
    tone === "green" ? "#22c55e" : tone === "amber" ? "#f59e0b" : "#ef4444";

  return (
    <View>
      <View className="flex-row items-center gap-1.5">
        <View
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          Members
        </Text>
      </View>
      <View className="flex-row items-baseline gap-0.5 mt-0.5">
        <Text className={`text-xl font-extrabold tabular-nums ${numeratorColor}`}>
          {joined}
        </Text>
        <Text className="text-xl font-extrabold text-muted-foreground tabular-nums">
          /{total}
        </Text>
      </View>
      <Text className="text-[10px] text-muted-foreground">on PotKeeper</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </Text>
      <Text className="text-xl font-extrabold mt-0.5">{value}</Text>
    </View>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-muted px-2 py-0.5">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

// ============================================================================
// Roster section (lives in the Members tab).
// ============================================================================

function RosterSection({
  members,
  currentProfileId,
  leagueName,
}: {
  members: LeagueMember[];
  currentProfileId: string | null;
  leagueName: string;
}) {
  const joinedCount = members.filter((m) => m.linked_profile_id != null).length;
  return (
    <View>
      <View className="flex-row items-center justify-between mb-2 px-1">
        <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          Roster ({members.length})
        </Text>
        <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          <Text className="text-green-700 dark:text-green-400">{joinedCount}</Text>
          /{members.length} on PotKeeper
        </Text>
      </View>
      <View className="rounded-2xl border border-border bg-card overflow-hidden">
        {members.map((m, i) => (
          <MemberRow
            key={m.id}
            member={m}
            isYou={m.linked_profile_id === currentProfileId}
            isLast={i === members.length - 1}
            leagueName={leagueName}
          />
        ))}
      </View>
    </View>
  );
}

function MemberRow({
  member,
  isYou,
  isLast,
  leagueName,
}: {
  member: LeagueMember;
  isYou: boolean;
  isLast: boolean;
  leagueName: string;
}) {
  const primary =
    member.team_name ??
    member.external_display_name ??
    member.external_username ??
    "Unknown";
  const handle = member.external_display_name ?? member.external_username;
  const secondary = member.team_name && handle ? `@${handle}` : null;
  const initial = primary[0]?.toUpperCase() ?? "?";
  // The commissioner already has its own invite affordance in the league
  // header card; suppressing the row-level one for them keeps the UI from
  // double-pumping the same action.
  const showInvite =
    !isYou && !member.is_owner && member.linked_profile_id == null;

  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3 ${
        isLast ? "" : "border-b border-border"
      } ${isYou ? "bg-green-500/5" : ""}`}
    >
      <RosterBadge rosterId={member.roster_id} />
      <Avatar alt={primary} className="h-10 w-10">
        {member.avatar_url ? (
          <AvatarImage source={{ uri: member.avatar_url }} />
        ) : null}
        <AvatarFallback>
          <Text>{initial}</Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 min-w-0">
        <Text className="font-semibold" numberOfLines={1}>
          {primary}
        </Text>
        {secondary && (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {secondary}
          </Text>
        )}
      </View>
      <View className="flex-row items-center gap-1.5">
        {member.is_owner && <Chip label="Commish" tone="gold" />}
        {isYou && <Chip label="You" tone="green" />}
        {member.linked_profile_id && !isYou && (
          <Chip label="Joined" tone="green" />
        )}
        {showInvite && (
          <Pressable
            onPress={() =>
              shareLeagueInvite({
                recipientLabel: primary,
                leagueName,
                isCommissionerInvite: false,
              })
            }
            className="rounded-full bg-sky-500/15 px-2.5 py-1 active:opacity-70"
            hitSlop={6}
          >
            <View className="flex-row items-center gap-1">
              <FontAwesome name="share" size={10} color="#0ea5e9" />
              <Text className="text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                Invite
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function RosterBadge({ rosterId }: { rosterId: number | null }) {
  if (rosterId == null) {
    return (
      <View className="h-8 w-8 rounded-full bg-muted items-center justify-center">
        <Text className="text-xs text-muted-foreground">—</Text>
      </View>
    );
  }
  return (
    <View className="h-8 w-8 rounded-full bg-muted items-center justify-center">
      <Text className="text-sm font-bold tabular-nums">{rosterId}</Text>
    </View>
  );
}

function Chip({ label, tone }: { label: string; tone: "gold" | "green" }) {
  const styles = tone === "gold" ? "bg-amber-500/15" : "bg-green-500/15";
  const textStyles =
    tone === "gold"
      ? "text-amber-600 dark:text-amber-400"
      : "text-green-700 dark:text-green-400";
  return (
    <View className={`rounded-full px-2 py-0.5 ${styles}`}>
      <Text
        className={`text-[10px] font-semibold uppercase tracking-wide ${textStyles}`}
      >
        {label}
      </Text>
    </View>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatLeagueStatus(status: string | null): string | null {
  if (!status) return null;
  if (status === "complete") return "Season complete";
  if (status === "in_season") return "In season";
  if (status === "drafting") return "Drafting";
  if (status === "pre_draft") return "Pre-draft";
  return status.replace(/_/g, " ");
}

// Opens the native Share sheet pre-filled with an invite message. We don't
// have push or email yet (parked under p3), so Share is the no-infra path
// that lets users nudge leaguemates via iMessage / Discord / group chat.
// Once they sign up + verify their Sleeper handle, the auto-link trigger
// (`platform_identities_auto_link`, migration 20260502000018) joins them
// to this league automatically.
async function shareLeagueInvite(args: {
  recipientLabel: string;
  leagueName: string;
  isCommissionerInvite: boolean;
}) {
  const { recipientLabel, leagueName, isCommissionerInvite } = args;
  const message = isCommissionerInvite
    ? `Hey ${recipientLabel} — I added our Sleeper league "${leagueName}" to PotKeeper. Sign up at potkeeper.app to set up the buy-in.`
    : `Hey ${recipientLabel} — our Sleeper league "${leagueName}" is on PotKeeper. Sign up at potkeeper.app and you'll auto-join.`;
  try {
    await Share.share({ message });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    Alert.alert("Couldn't open share sheet", detail);
  }
}

function formatCents(cents: number): string {
  if (cents % 100 === 0) return `$${(cents / 100).toFixed(0)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRecord(s: NormalizedStanding): string {
  if (s.ties > 0) return `${s.wins}-${s.losses}-${s.ties}`;
  return `${s.wins}-${s.losses}`;
}

// Resolves a display name for a member row. Falls back to the standing's
// roster id so we never show "Unknown" — keeps the breakdown readable even
// if a roster has no league_member row yet (rare but possible during sync).
function displayMemberName(
  member: LeagueMember | null,
  standing: NormalizedStanding,
): string {
  return (
    member?.team_name ??
    member?.external_display_name ??
    member?.external_username ??
    `Roster ${standing.roster_id}`
  );
}

// Compact relative time formatter ("2m", "3h", "yesterday", "Apr 28").
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  // For older snapshots, fall back to a date stamp.
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// "in 2h", "in 3d", "in 12m". Used by the authorization banner to surface how
// long is left on the window without forcing a per-second tick on the league
// detail screen (the dedicated Screen 8.2 has the precise countdown).
function formatRelativeFuture(iso: string): string {
  const target = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((target - Date.now()) / 1000));
  if (diffSec < 60) return "in less than a minute";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `in ${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `in ${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  return `in ${diffDay}d`;
}

// Snapshot.standings is jsonb. Validate-on-read so a malformed row doesn't
// crash the screen.
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
  // Defensive sort: snapshot is pre-sorted by the writer, but if a future
  // writer drifts we still render in ranked order.
  return out.sort((a, b) => a.rank - b.rank);
}

// payout_split is stored as Json (jsonb), so we sanity-check the shape at read.
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

// Set of ranks that get a payout — used to show the trophy on those rows.
function parsePayoutRanks(
  payoutSplit: League["payout_split"],
): Set<number> {
  return new Set(parseRanks(payoutSplit).map((r) => r.rank));
}

function rankLabel(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}
