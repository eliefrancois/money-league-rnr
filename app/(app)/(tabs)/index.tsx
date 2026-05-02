import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "~/components/ui/text";
import { ThemeToggle } from "~/components/ThemeToggle";
import { SyncButtonRow } from "~/components/SyncButtonRow";
import { useLeagues, formatLeagueStatus } from "~/lib/useLeagues";
import type { LeagueWithMembership } from "~/lib/useLeagues";
import { useColorScheme } from "~/lib/useColorScheme";

// Home tab — the dashboard surface. Filled state shows a hero summary,
// a horizontal scroll of leagues, and an activity placeholder. Empty
// state surfaces the platform sync row so first-time users can connect
// fantasy accounts. Full list-of-leagues lives in the Leagues tab.
export default function HomeTab() {
  const { leagues, error } = useLeagues();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-secondary/30">
      <View
        className="px-5 pb-2 flex-row items-center justify-between"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Text className="text-2xl font-extrabold tracking-tight">Home</Text>
        <ThemeToggle />
      </View>

      {leagues === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center gap-2 p-6">
          <FontAwesome name="exclamation-triangle" size={28} color="#f59e0b" />
          <Text className="text-center text-muted-foreground">{error}</Text>
        </View>
      ) : leagues.length === 0 ? (
        <HomeEmpty />
      ) : (
        <HomeFilled leagues={leagues} />
      )}
    </View>
  );
}

// Empty state — no leagues yet. Two-CTA layout: connect a platform
// (most-popular path), or jump straight to creating from scratch
// (Phase 2; we surface only the platform row for now).
function HomeEmpty() {
  return (
    <ScrollView contentContainerClassName="flex-grow justify-center items-center gap-5 p-6">
      <Text className="text-2xl font-bold mb-1">Welcome to PotKeeper</Text>
      <Text className="text-center text-muted-foreground -mt-2 mb-2">
        Connect a fantasy account to import your first league.
      </Text>
      <SyncButtonRow />
    </ScrollView>
  );
}

// Filled state — hero card with active money, horizontal league strip,
// and an activity placeholder. Sparkline / projected winnings is a
// follow-up polish pass once we have real activity data wired.
function HomeFilled({ leagues }: { leagues: LeagueWithMembership[] }) {
  const totalStake = leagues.reduce(
    (sum, { league }) => sum + (league.buy_in_cents ?? 0),
    0,
  );
  const stakeLabel = `$${(totalStake / 100).toFixed(0)}`;

  return (
    <ScrollView contentContainerClassName="pb-10 gap-6">
      <View className="px-5">
        <View className="rounded-3xl border border-border bg-card p-5">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your active money
          </Text>
          <Text className="text-5xl font-extrabold tracking-tighter mt-1">
            {stakeLabel}
          </Text>
          <Text className="text-xs text-muted-foreground mt-2">
            across {leagues.length} {leagues.length === 1 ? "league" : "leagues"}
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <View className="px-5 flex-row items-center justify-between">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your leagues
          </Text>
          <Pressable
            onPress={() => router.push("/(app)/(tabs)/leagues")}
            hitSlop={8}
            className="flex-row items-center gap-1"
          >
            <Text className="text-xs font-semibold text-primary">See all</Text>
            <FontAwesome name="chevron-right" size={10} color="#6366F1" />
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-5"
        >
          {leagues.slice(0, 4).map((entry) => (
            <LeagueCardMini key={entry.league.id} entry={entry} />
          ))}
          <AddLeagueTile />
        </ScrollView>
      </View>

      <View className="px-5 gap-2">
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Activity
        </Text>
        <View className="rounded-2xl border border-dashed border-border bg-card/50 p-6 items-center">
          <FontAwesome name="clock-o" size={20} color="#94a3b8" />
          <Text className="text-xs text-muted-foreground text-center mt-2">
            Buy-ins, weekly results, and payouts will land here once the season
            kicks off.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function LeagueCardMini({ entry }: { entry: LeagueWithMembership }) {
  const { league } = entry;
  const status = formatLeagueStatus(league.status);
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/league/[id]", params: { id: league.id } })
      }
      className="active:opacity-80"
    >
      <View className="w-56 rounded-2xl border border-border bg-card p-4 gap-2">
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {league.platform.charAt(0).toUpperCase() + league.platform.slice(1)} ·{" "}
          {league.season}
        </Text>
        <Text className="text-base font-bold tracking-tight" numberOfLines={1}>
          {league.name}
        </Text>
        <Text className="text-2xl font-extrabold text-emerald-500">
          {league.buy_in_cents != null
            ? `$${(league.buy_in_cents / 100).toFixed(0)}`
            : "—"}
        </Text>
        {status && (
          <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {status}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function AddLeagueTile() {
  const { isDarkColorScheme } = useColorScheme();
  return (
    <Pressable
      onPress={() => router.push("/sleeper-link")}
      className="active:opacity-80"
    >
      <View className="w-32 h-full rounded-2xl border border-dashed border-border bg-transparent items-center justify-center gap-2 p-4">
        <View className="h-9 w-9 rounded-full bg-card items-center justify-center">
          <FontAwesome
            name="plus"
            size={16}
            color={isDarkColorScheme ? "#FAFAFA" : "#0A0A0F"}
          />
        </View>
        <Text className="text-xs font-semibold">New league</Text>
      </View>
    </Pressable>
  );
}
