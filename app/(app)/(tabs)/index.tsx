import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "~/components/ui/text";
import { ThemeToggle } from "~/components/ThemeToggle";
import { SyncButtonRow } from "~/components/SyncButtonRow";
import { useLeagues, formatLeagueStatus } from "~/lib/useLeagues";
import type { LeagueWithMembership } from "~/lib/useLeagues";
import {
  useDashboardSummary,
  describeActivity,
  type ActivityRow,
} from "~/lib/useDashboardSummary";
import { useColorScheme } from "~/lib/useColorScheme";

// Home tab — the dashboard surface. Filled state shows a hero summary,
// a horizontal scroll of leagues, and a recent-activity feed. Empty
// state surfaces the platform sync row so first-time users can connect
// fantasy accounts. Full list-of-leagues lives in the Leagues tab.
export default function HomeTab() {
  const { leagues, error } = useLeagues();
  const summary = useDashboardSummary();
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
        <HomeFilled
          leagues={leagues}
          activeMoneyCents={summary.activeMoneyCents}
          activity={summary.activity}
        />
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

// Filled state — hero card with active money + decorative sparkline,
// horizontal league strip, and an activity feed sourced from pot_ledger.
function HomeFilled({
  leagues,
  activeMoneyCents,
  activity,
}: {
  leagues: LeagueWithMembership[];
  activeMoneyCents: number;
  activity: ActivityRow[];
}) {
  // Show the user's confirmed staked dollars when we have them; if the
  // ledger query came back empty (e.g. brand-new users who imported but
  // haven't paid yet) fall back to the configured buy-in totals so the
  // hero still has something meaningful.
  const fallbackCents = leagues.reduce(
    (sum, { league }) => sum + (league.buy_in_cents ?? 0),
    0,
  );
  const displayCents = activeMoneyCents > 0 ? activeMoneyCents : fallbackCents;
  const dollarLabel = `$${(displayCents / 100).toFixed(0)}`;
  const isPotential = activeMoneyCents === 0 && fallbackCents > 0;

  return (
    <ScrollView contentContainerClassName="pb-10 gap-6">
      <View className="px-5">
        <HeroCard
          dollarLabel={dollarLabel}
          leagueCount={leagues.length}
          isPotential={isPotential}
        />
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
        {activity.length === 0 ? (
          <View className="rounded-2xl border border-dashed border-border bg-card/50 p-6 items-center">
            <FontAwesome name="clock-o" size={20} color="#94a3b8" />
            <Text className="text-xs text-muted-foreground text-center mt-2">
              Buy-ins, weekly results, and payouts will land here once the
              season kicks off.
            </Text>
          </View>
        ) : (
          <View className="rounded-2xl border border-border bg-card overflow-hidden">
            {activity.map((row, idx) => (
              <ActivityRowView
                key={row.id}
                row={row}
                isLast={idx === activity.length - 1}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// Hero card — "Your active money" + dollar value + decorative sparkline.
// Sparkline shape is fixed for now (no real time-series data); once we
// store weekly snapshots we'll plot the user's pot trajectory here.
function HeroCard({
  dollarLabel,
  leagueCount,
  isPotential,
}: {
  dollarLabel: string;
  leagueCount: number;
  isPotential: boolean;
}) {
  return (
    <View className="rounded-3xl border border-border bg-card p-5 overflow-hidden">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {isPotential ? "Your potential stake" : "Your active money"}
      </Text>
      <Text className="text-5xl font-extrabold tracking-tighter mt-1">
        {dollarLabel}
      </Text>
      <Text className="text-xs text-muted-foreground mt-2">
        across {leagueCount} {leagueCount === 1 ? "league" : "leagues"}
        {isPotential ? " · pay your buy-in to lock it in" : ""}
      </Text>
      <View className="mt-3 -mx-1 opacity-90">
        <Svg width="100%" height={42} viewBox="0 0 280 42" preserveAspectRatio="none">
          <Path
            d="M0 32 L30 28 L60 30 L90 24 L120 22 L150 18 L180 20 L210 14 L240 10 L280 6"
            fill="none"
            stroke="#22C55E"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Path
            d="M0 32 L30 28 L60 30 L90 24 L120 22 L150 18 L180 20 L210 14 L240 10 L280 6 L280 42 L0 42 Z"
            fill="#22C55E"
            fillOpacity={0.14}
          />
        </Svg>
      </View>
    </View>
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

// Activity feed row — taps deep-link to the relevant league.
function ActivityRowView({
  row,
  isLast,
}: {
  row: ActivityRow;
  isLast: boolean;
}) {
  const { label, icon, tone } = describeActivity(row.type);
  const toneColor =
    tone === "positive" ? "#22C55E" : tone === "negative" ? "#EF4444" : "#6366F1";
  const toneBg =
    tone === "positive"
      ? "bg-emerald-500/15"
      : tone === "negative"
        ? "bg-red-500/15"
        : "bg-primary/15";
  const sign = tone === "negative" ? "-" : tone === "positive" ? "+" : "";
  const amount = `${sign}$${Math.abs(row.amountCents / 100).toFixed(0)}`;

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/league/[id]", params: { id: row.leagueId } })
      }
      className="active:opacity-80"
    >
      <View
        className={`flex-row items-center gap-3 px-4 py-3 ${
          isLast ? "" : "border-b border-border"
        }`}
      >
        <View
          className={`h-8 w-8 rounded-lg items-center justify-center ${toneBg}`}
        >
          <FontAwesome name={icon} size={13} color={toneColor} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold" numberOfLines={1}>
            {label}
          </Text>
          <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
            {row.leagueName} · {formatRelativeDate(row.createdAt)}
          </Text>
        </View>
        <Text
          className="text-sm font-extrabold"
          style={{
            color:
              tone === "positive"
                ? "#22C55E"
                : tone === "negative"
                  ? "#EF4444"
                  : undefined,
          }}
        >
          {amount}
        </Text>
      </View>
    </Pressable>
  );
}

// Compact relative date for the activity feed. We avoid a date library to
// keep the bundle lean — this covers the common cases that show up in 5
// most-recent ledger entries (today / yesterday / N days / N weeks).
function formatRelativeDate(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 60 * 1000) return "just now";
  if (diffMs < day) return `${Math.floor(diffMs / (60 * 60 * 1000))}h ago`;
  if (diffMs < 2 * day) return "yesterday";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / (7 * day))}w ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
