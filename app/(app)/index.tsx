import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { supabase } from "~/utils/supabase";
import type { Tables } from "~/lib/database.types";

type League = Tables<"leagues">;
type LeagueMember = Tables<"league_members">;

// A league row + my membership in it (we only fetch my own member row, never others).
interface LeagueWithMembership {
  league: League;
  my: Pick<LeagueMember, "roster_id" | "is_owner" | "linked_profile_id">;
}

export default function Screen() {
  const [leagues, setLeagues] = useState<LeagueWithMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const profileId = sessionData.session?.user.id;
        if (!profileId) {
          if (!cancelled) setLeagues([]);
          return;
        }

        // Filtered embed: pull leagues where THIS user has a league_members row.
        // !inner makes it an inner join so we never get leagues without membership.
        const { data, error } = await supabase
          .from("leagues")
          .select(
            "*, league_members!inner(roster_id, is_owner, linked_profile_id)",
          )
          .eq("league_members.linked_profile_id", profileId)
          .order("season", { ascending: false })
          .order("created_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          setError(error.message);
          setLeagues([]);
          return;
        }

        const rows: LeagueWithMembership[] = (data ?? []).map((row) => {
          const { league_members, ...league } = row as League & {
            league_members: LeagueMember[];
          };
          return {
            league: league as League,
            my: league_members[0] ?? {
              roster_id: null,
              is_owner: false,
              linked_profile_id: null,
            },
          };
        });
        setLeagues(rows);
      };

      load();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (leagues === null) {
    return (
      <View className="flex-1 items-center justify-center bg-secondary/30">
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-2 p-6 bg-secondary/30">
        <FontAwesome name="exclamation-triangle" size={28} color="#f59e0b" />
        <Text className="text-center text-muted-foreground">{error}</Text>
      </View>
    );
  }

  if (leagues.length === 0) {
    return <EmptyState />;
  }

  return <LeaguesList leagues={leagues} />;
}

// =============================================================================
// Empty state — shown to brand-new users with no imported leagues.
// =============================================================================

function EmptyState() {
  return (
    <View className="flex-1 justify-center items-center gap-5 p-6 bg-secondary/30">
      <Text className="text-2xl font-bold mb-1">Welcome to PotKeeper</Text>
      <Text className="text-center text-muted-foreground -mt-2 mb-2">
        Connect a fantasy account to import your first league.
      </Text>
      <SyncButtonRow />
      <View className="w-full max-w-sm">
        <DevDebugTools />
      </View>
    </View>
  );
}

// =============================================================================
// Populated state — list of leagues with "Add another" CTA.
// =============================================================================

function LeaguesList({ leagues }: { leagues: LeagueWithMembership[] }) {
  return (
    <ScrollView contentContainerClassName="p-5 gap-3 bg-secondary/30">
      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1">
        Your leagues ({leagues.length})
      </Text>

      {leagues.map(({ league, my }) => (
        <LeagueCard key={league.id} league={league} my={my} />
      ))}

      <View className="mt-2 gap-2">
        <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1">
          Add another
        </Text>
        <SyncButtonRow compact />
      </View>

      <DevDebugTools />
    </ScrollView>
  );
}

// =============================================================================
// Dev-only debug tools (stripped from production via __DEV__).
// Lets us reach Flow 7 / wallet without the natural payout-time trigger
// that doesn't exist yet. Remove this whole block once Flow 8 (end-of-
// season payout) wires up the real entry point on home / league detail.
// =============================================================================

function DevDebugTools() {
  if (!__DEV__) return null;
  return (
    <View className="mt-6 gap-2 opacity-60">
      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1">
        Dev tools
      </Text>
      <Pressable
        onPress={() => router.push("/(app)/wallet")}
        className="rounded-2xl border border-dashed border-border bg-card/50 p-3 flex-row items-center gap-3"
      >
        <FontAwesome name="bug" size={14} color="#94a3b8" />
        <View className="flex-1">
          <Text className="text-xs font-semibold">Open wallet</Text>
          <Text className="text-[10px] text-muted-foreground">
            Stripe Connect onboarding (Flow 7) — dev shortcut
          </Text>
        </View>
        <FontAwesome name="chevron-right" size={11} color="#94a3b8" />
      </Pressable>
    </View>
  );
}

function LeagueCard({
  league,
  my,
}: {
  league: League;
  my: LeagueWithMembership["my"];
}) {
  const platformLabel =
    league.platform.charAt(0).toUpperCase() + league.platform.slice(1);
  const statusBadge = formatLeagueStatus(league.status);

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/league/[id]",
          params: { id: league.id },
        })
      }
      className="active:opacity-80"
    >
      <View className="rounded-2xl border border-border bg-card p-4 gap-2">
        <View className="flex-row items-start gap-2">
          <View className="flex-1">
            <Text
              className="text-lg font-extrabold tracking-tight"
              numberOfLines={1}
            >
              {league.name}
            </Text>
            <Text className="text-xs text-muted-foreground mt-0.5">
              {league.season} · {platformLabel}
              {league.total_rosters != null
                ? ` · ${league.total_rosters} teams`
                : ""}
            </Text>
          </View>
          {statusBadge && (
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {statusBadge}
              </Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center gap-1.5 mt-1">
          {my.is_owner && (
            <View className="rounded-full bg-amber-500/15 px-2 py-0.5">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Commish
              </Text>
            </View>
          )}
          {my.roster_id != null && (
            <Text className="text-xs text-muted-foreground">
              You're roster #{my.roster_id}
            </Text>
          )}
          {league.buy_in_cents != null && (
            <Text className="text-xs text-muted-foreground">
              · Buy-in ${(league.buy_in_cents / 100).toFixed(0)}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// =============================================================================
// Sync buttons (shared by empty + populated states)
// =============================================================================

function SyncButtonRow({ compact = false }: { compact?: boolean }) {
  const handleSyncSleeper = () => router.push("/sleeper-link");
  const handleSyncEspn = () =>
    Alert.alert(
      "Coming soon",
      "ESPN sync is being rebuilt with secure cookie storage. Available in the next session.",
    );
  const handleSyncYahoo = () =>
    Alert.alert(
      "Coming soon",
      "Yahoo Fantasy support is planned for v2 (OAuth required).",
    );

  return (
    <View className={compact ? "gap-2" : "gap-3 w-full max-w-sm"}>
      <Button onPress={handleSyncSleeper} variant={compact ? "outline" : "default"}>
        <View className="flex-row items-center gap-2">
          <Image
            source={require("~/assets/league_sync/sleeper_icon.jpg")}
            style={{ width: 22, height: 22, borderRadius: 4 }}
          />
          <Text>Sync Sleeper</Text>
        </View>
      </Button>
      <Button onPress={handleSyncEspn} variant={compact ? "outline" : "secondary"}>
        <View className="flex-row items-center gap-2">
          <Image
            source={require("~/assets/league_sync/espn_icon.jpeg")}
            style={{ width: 22, height: 22, borderRadius: 4 }}
          />
          <Text>Sync ESPN</Text>
        </View>
      </Button>
      <Button onPress={handleSyncYahoo} variant={compact ? "outline" : "secondary"}>
        <View className="flex-row items-center gap-2">
          <Image
            source={require("~/assets/league_sync/yahoo_icon.png")}
            style={{ width: 22, height: 22, borderRadius: 4 }}
          />
          <Text>Sync Yahoo</Text>
        </View>
      </Button>
    </View>
  );
}

function formatLeagueStatus(status: string | null): string | null {
  if (!status) return null;
  if (status === "complete") return "Season complete";
  if (status === "in_season") return "In season";
  if (status === "drafting") return "Drafting";
  if (status === "pre_draft") return "Pre-draft";
  return status.replace(/_/g, " ");
}
