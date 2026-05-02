import { useState } from "react";
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

type SubTab = "active" | "past" | "sleeper" | "espn";

// Leagues tab — full list of the user's leagues with sub-tab pills for
// Active / Past / From Sleeper / From ESPN. Active is shipped; Past
// shows lifetime winnings once we have completed seasons; the platform
// sub-tabs surface unconverted leagues from Sleeper / ESPN once those
// connectors return them. For now Past + ESPN show informational stubs.
export default function LeaguesTab() {
  const { leagues, error } = useLeagues();
  const insets = useSafeAreaInsets();
  const { isDarkColorScheme } = useColorScheme();
  const [tab, setTab] = useState<SubTab>("active");

  // primary-foreground is near-black in dark mode (primary inverts to white)
  // and near-white in light mode. FontAwesome takes a hex string, so we have
  // to mirror that here instead of relying on the Tailwind class.
  const newButtonIconColor = isDarkColorScheme ? "#0A0A0F" : "#FAFAFA";

  return (
    <View className="flex-1 bg-secondary/30">
      <View
        className="px-5 pb-2 flex-row items-center justify-between"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Text className="text-2xl font-extrabold tracking-tight">Leagues</Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.push("/sleeper-link")}
            className="h-9 px-3 rounded-full bg-primary flex-row items-center gap-1.5"
          >
            <FontAwesome name="plus" size={11} color={newButtonIconColor} />
            <Text className="text-xs font-bold text-primary-foreground">
              New
            </Text>
          </Pressable>
          <ThemeToggle />
        </View>
      </View>

      <SubTabBar
        tab={tab}
        onChange={setTab}
        counts={{ active: leagues?.length ?? 0 }}
      />

      {leagues === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center gap-2 p-6">
          <FontAwesome name="exclamation-triangle" size={28} color="#f59e0b" />
          <Text className="text-center text-muted-foreground">{error}</Text>
        </View>
      ) : tab === "active" ? (
        leagues.length === 0 ? (
          <ScrollView contentContainerClassName="flex-grow justify-center items-center gap-5 p-6">
            <Text className="text-2xl font-bold mb-1">No active leagues</Text>
            <Text className="text-center text-muted-foreground -mt-2 mb-2">
              Connect a fantasy account to import your first league.
            </Text>
            <SyncButtonRow />
          </ScrollView>
        ) : (
          <ScrollView contentContainerClassName="p-5 gap-3 pb-10">
            {leagues.map((entry) => (
              <LeagueListCard key={entry.league.id} entry={entry} />
            ))}
            <View className="mt-2 gap-2">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1">
                Add another
              </Text>
              <SyncButtonRow compact />
            </View>
          </ScrollView>
        )
      ) : (
        <SubTabStub tab={tab} />
      )}
    </View>
  );
}

function SubTabBar({
  tab,
  onChange,
  counts,
}: {
  tab: SubTab;
  onChange: (next: SubTab) => void;
  counts: { active: number };
}) {
  const items: { id: SubTab; label: string; count?: number }[] = [
    { id: "active", label: "Active", count: counts.active },
    { id: "past", label: "Past" },
    { id: "sleeper", label: "From Sleeper" },
    { id: "espn", label: "From ESPN" },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-5 pb-3 border-b border-border"
    >
      {items.map((item) => {
        const active = item.id === tab;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            className={`px-3.5 h-9 rounded-full flex-row items-center gap-1.5 border ${
              active
                ? "bg-primary/15 border-primary/40"
                : "bg-transparent border-border"
            }`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {item.label}
            </Text>
            {item.count != null && (
              <View
                className={`px-1.5 rounded-full ${
                  active ? "bg-primary" : "bg-muted"
                }`}
              >
                <Text
                  className={`text-[10px] font-bold ${
                    active ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {item.count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SubTabStub({ tab }: { tab: SubTab }) {
  const copy: Record<SubTab, { title: string; body: string }> = {
    active: { title: "", body: "" },
    past: {
      title: "Past seasons",
      body:
        "Lifetime winnings show up here once you've finished a season on PotKeeper.",
    },
    sleeper: {
      title: "From Sleeper",
      body:
        "Imported Sleeper leagues that haven't added a pot yet will surface here. Coming Sprint 5.",
    },
    espn: {
      title: "From ESPN",
      body:
        "ESPN sync is being rebuilt with secure cookie storage. Available next session.",
    },
  };
  const { title, body } = copy[tab];
  return (
    <View className="flex-1 items-center justify-center px-8 gap-3">
      <FontAwesome name="hourglass-half" size={28} color="#94a3b8" />
      <Text className="text-base font-semibold text-center">{title}</Text>
      <Text className="text-sm text-muted-foreground text-center">{body}</Text>
    </View>
  );
}

function LeagueListCard({ entry }: { entry: LeagueWithMembership }) {
  const { league, my } = entry;
  const platformLabel =
    league.platform.charAt(0).toUpperCase() + league.platform.slice(1);
  const status = formatLeagueStatus(league.status);

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/league/[id]", params: { id: league.id } })
      }
      className="active:opacity-80"
    >
      <View className="rounded-2xl border border-border bg-card p-4 gap-2">
        <View className="flex-row items-start gap-2">
          <View className="flex-1">
            <Text className="text-lg font-extrabold tracking-tight" numberOfLines={1}>
              {league.name}
            </Text>
            <Text className="text-xs text-muted-foreground mt-0.5">
              {league.season} · {platformLabel}
              {league.total_rosters != null
                ? ` · ${league.total_rosters} teams`
                : ""}
            </Text>
          </View>
          {status && (
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {status}
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
