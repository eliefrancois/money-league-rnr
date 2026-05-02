import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSession } from "~/context";
import type { Json, Tables } from "~/lib/database.types";
import { useColorScheme } from "~/lib/useColorScheme";
import { supabase } from "~/utils/supabase";

type League = Tables<"leagues">;

// Implements APP_FLOW.md Screen 3.2 (commissioner sets buy-in + payout split
// + fee policy on an already-imported league). Stripe checkout (Flow 5) is a
// separate later screen — this one only writes config to the leagues row.
//
// Supports both "first-time setup" and "edit" paths. Presets cover the 90%
// case from the prototype; custom payout split deferred until we wire the
// custom slider UI from Screen 4.3 (TODO when sliders are needed).

const BUY_IN_PRESETS_DOLLARS = [25, 50, 100, 200, 500] as const;

type PayoutPreset = "standard" | "winner_takes_all" | "top_half";

interface PayoutSplit {
  preset: PayoutPreset | "custom";
  ranks: Record<string, number>;
}

// =============================================================================
// Preset → ranks resolution. Member count only matters for top_half; the other
// two are static.
// =============================================================================

function resolvePresetRanks(
  preset: PayoutPreset,
  memberCount: number,
): Record<string, number> {
  if (preset === "winner_takes_all") return { "1": 100 };
  if (preset === "standard") return { "1": 60, "2": 30, "3": 10 };

  // top_half — harmonic-ish distribution: 1st gets the biggest slice, dropping
  // off by 1/n. Last position absorbs rounding so the sum is exactly 100.
  const k = Math.max(1, Math.floor(memberCount / 2));
  if (k === 1) return { "1": 100 };
  const weights = Array.from({ length: k }, (_, i) => 1 / (i + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const ranks: Record<string, number> = {};
  let allocated = 0;
  for (let i = 0; i < k - 1; i++) {
    const rounded = Math.round((weights[i] / total) * 100);
    ranks[String(i + 1)] = rounded;
    allocated += rounded;
  }
  ranks[String(k)] = 100 - allocated;
  return ranks;
}

function detectPreset(
  ranks: Record<string, number>,
  memberCount: number,
): PayoutPreset | "custom" {
  const standard = resolvePresetRanks("standard", memberCount);
  const winner = resolvePresetRanks("winner_takes_all", memberCount);
  const topHalf = resolvePresetRanks("top_half", memberCount);
  if (sameRanks(ranks, standard)) return "standard";
  if (sameRanks(ranks, winner)) return "winner_takes_all";
  if (sameRanks(ranks, topHalf)) return "top_half";
  return "custom";
}

// `redeem-sponsorship-code` returns 4xx with `{ error: "<code>" }` for known
// failure modes. Map those codes to user copy here so the engineer-facing
// strings never leak into Alert dialogs.
const SPONSORSHIP_ERROR_COPY: Record<string, { title: string; message: string }> = {
  invalid_code: {
    title: "Code not found",
    message: "Double-check the spelling — sponsorship codes are case-insensitive but every character has to match.",
  },
  expired: {
    title: "Code expired",
    message: "This sponsorship has passed its expiration date. Reach out to your partner for a fresh code.",
  },
  already_redeemed: {
    title: "Already used",
    message: "This code has already been claimed by another league.",
  },
  already_redeemed_for_this_league: {
    title: "Already linked",
    message: "This league already has this sponsorship code applied.",
  },
  league_already_has_sponsorship: {
    title: "Sponsorship already linked",
    message: "This league already has an active sponsorship. Cancel it first or wait for it to expire.",
  },
};

async function mapSponsorshipError(error: unknown): Promise<{ title: string; message: string }> {
  let code: string | null = null;
  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === "function") {
      try {
        const body = (await (ctx as Response).clone().json()) as { error?: string };
        if (typeof body?.error === "string") code = body.error;
      } catch {
        // body wasn't JSON; fall through to generic copy
      }
    }
  }
  if (code && SPONSORSHIP_ERROR_COPY[code]) {
    return SPONSORSHIP_ERROR_COPY[code];
  }
  return {
    title: "Could not apply code",
    message:
      error instanceof Error && error.message
        ? error.message
        : "Check the code and try again.",
  };
}

function sameRanks(a: Record<string, number>, b: Record<string, number>) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) if (a[k] !== b[k]) return false;
  return true;
}

// =============================================================================
// Screen
// =============================================================================

export default function BuyInSetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [league, setLeague] = useState<League | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [buyInDollars, setBuyInDollars] = useState<number>(0);
  const [preset, setPreset] = useState<PayoutPreset>("standard");
  const [feePayer, setFeePayer] = useState<"members" | "commissioner">(
    "members",
  );
  const [saving, setSaving] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [sponsorCode, setSponsorCode] = useState("");
  const [sponsorBusy, setSponsorBusy] = useState(false);

  // Hydrate from DB on mount (covers both first-time and edit flows).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      if (!data) {
        setLoadError("League not found.");
        return;
      }
      setLeague(data);
      if (data.buy_in_cents != null) {
        setBuyInDollars(Math.round(data.buy_in_cents / 100));
      }
      if (data.fee_payer === "commissioner" || data.fee_payer === "members") {
        setFeePayer(data.fee_payer);
      }
      const ranks = readRanks(data.payout_split);
      if (ranks) {
        const detected = detectPreset(ranks, data.total_rosters ?? 0);
        if (detected !== "custom") setPreset(detected);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const memberCount = league?.total_rosters ?? 0;
  const ranks = useMemo(
    () => resolvePresetRanks(preset, memberCount),
    [preset, memberCount],
  );

  const buyInCents = Math.round(buyInDollars * 100);
  const totalPotCents = buyInCents * memberCount;
  const isCommissioner =
    user != null && league?.commissioner_profile_id === user.id;

  const handleApplySponsor = async () => {
    if (!league || !user) return;
    if (!isCommissioner) return;
    const raw = sponsorCode.trim();
    if (raw.length < 4) {
      Alert.alert("Enter a code", "Paste the full sponsorship code.");
      return;
    }
    setSponsorBusy(true);
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      partner_name?: string;
      boost_max_cents?: number;
      error?: string;
    }>("redeem-sponsorship-code", {
      body: { league_id: league.id, code: raw },
    });
    setSponsorBusy(false);
    if (error) {
      const { title, message } = await mapSponsorshipError(error);
      Alert.alert(title, message);
      return;
    }
    if (!data?.ok) {
      Alert.alert(
        "Could not apply code",
        "Double-check the code or try again later.",
      );
      return;
    }
    const { data: fresh, error: refetchErr } = await supabase
      .from("leagues")
      .select("*")
      .eq("id", league.id)
      .maybeSingle();
    if (refetchErr || !fresh) {
      Alert.alert(
        "Code applied",
        "Refresh the screen if you do not see the updated sponsorship status.",
      );
      return;
    }
    setLeague(fresh);
    setSponsorCode("");
    setSponsorOpen(false);
    Alert.alert(
      "Sponsorship linked",
      [
        data?.partner_name ? `${data.partner_name} · ` : "",
        `Up to ${formatCents(data?.boost_max_cents ?? 0)} may credit the pot once your league hits the threshold.`,
      ].join(""),
    );
  };

  const handleSave = async () => {
    if (!league || !user) return;
    if (!isCommissioner) {
      Alert.alert(
        "Commissioner only",
        "Only the league commissioner can set up the pot.",
      );
      return;
    }
    if (buyInDollars <= 0) {
      Alert.alert("Set a buy-in", "Buy-in must be greater than $0.");
      return;
    }
    const sum = Object.values(ranks).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.5) {
      Alert.alert("Bad split", `Payouts add up to ${sum}% — must equal 100%.`);
      return;
    }

    setSaving(true);
    const payoutSplit: PayoutSplit = { preset, ranks };
    const { error } = await supabase
      .from("leagues")
      .update({
        buy_in_cents: buyInCents,
        payout_split: payoutSplit as unknown as Json,
        fee_payer: feePayer,
        buyin_configured_at: new Date().toISOString(),
      })
      .eq("id", league.id);
    setSaving(false);

    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    router.back();
  };

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center gap-2 p-6 bg-secondary/30">
        <FontAwesome name="exclamation-triangle" size={28} color="#f59e0b" />
        <Text className="text-center text-muted-foreground">{loadError}</Text>
      </View>
    );
  }

  if (!league) {
    return (
      <View className="flex-1 items-center justify-center bg-secondary/30">
        <ActivityIndicator />
      </View>
    );
  }

  if (!isCommissioner) {
    return (
      <View className="flex-1 items-center justify-center gap-2 p-6 bg-secondary/30">
        <FontAwesome name="lock" size={28} color="#999" />
        <Text className="text-center text-muted-foreground">
          Only the league commissioner can set up the pot.
        </Text>
        <Button variant="outline" onPress={() => router.back()}>
          <Text>Back to league</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-secondary/30">
      <ScrollView contentContainerClassName="p-5 gap-5 pb-32">
        <SummaryCard league={league} />

        <Section title="How much per member?">
          <BuyInInput
            valueDollars={buyInDollars}
            onChange={setBuyInDollars}
          />
          <View className="flex-row gap-2 flex-wrap mt-3">
            {BUY_IN_PRESETS_DOLLARS.map((d) => (
              <PresetChip
                key={d}
                label={`$${d}`}
                selected={buyInDollars === d}
                onPress={() => setBuyInDollars(d)}
              />
            ))}
          </View>
        </Section>

        <Section title="How should winnings be split?">
          <PresetButton
            title="Standard"
            subtitle="1st 60% • 2nd 30% • 3rd 10%"
            selected={preset === "standard"}
            onPress={() => setPreset("standard")}
          />
          <PresetButton
            title="Winner takes all"
            subtitle="1st gets 100%"
            selected={preset === "winner_takes_all"}
            onPress={() => setPreset("winner_takes_all")}
          />
          <PresetButton
            title="Top half"
            subtitle={
              memberCount > 0
                ? `${Math.floor(memberCount / 2)} spots paid out`
                : "Half the league"
            }
            selected={preset === "top_half"}
            onPress={() => setPreset("top_half")}
          />
        </Section>

        <Section title="Who covers the 2.5% fee?">
          <PresetButton
            title="Members cover the fee"
            subtitle="Each buy-in is bumped 2.5% at checkout. Commissioner-friendly default."
            selected={feePayer === "members"}
            onPress={() => setFeePayer("members")}
          />
          <PresetButton
            title="I'll cover the fee"
            subtitle="2.5% comes out of the pot before payouts. Cleanest for members."
            selected={feePayer === "commissioner"}
            onPress={() => setFeePayer("commissioner")}
          />
        </Section>

        <Section title="Sponsorship (optional)">
          <SponsorshipSetupSection
            league={league}
            sponsorOpen={sponsorOpen}
            sponsorCode={sponsorCode}
            sponsorBusy={sponsorBusy}
            onToggleOpen={() => setSponsorOpen((o) => !o)}
            onSponsorCodeChange={setSponsorCode}
            onApply={handleApplySponsor}
          />
        </Section>

        <PreviewCard
          buyInCents={buyInCents}
          totalPotCents={totalPotCents}
          ranks={ranks}
          memberCount={memberCount}
          feePayer={feePayer}
        />
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-background p-4">
        <Button
          onPress={handleSave}
          disabled={saving || buyInDollars <= 0}
          className="w-full"
        >
          {saving ? (
            <ActivityIndicator />
          ) : (
            <Text className="font-bold">
              {league.buyin_configured_at != null
                ? "Save changes"
                : "Save buy-in"}
            </Text>
          )}
        </Button>
      </View>
    </View>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function SponsorshipSetupSection({
  league,
  sponsorOpen,
  sponsorCode,
  sponsorBusy,
  onToggleOpen,
  onSponsorCodeChange,
  onApply,
}: {
  league: League;
  sponsorOpen: boolean;
  sponsorCode: string;
  sponsorBusy: boolean;
  onToggleOpen: () => void;
  onSponsorCodeChange: (t: string) => void;
  onApply: () => void;
}) {
  const { isDarkColorScheme } = useColorScheme();

  if (
    league.sponsorship_status === "redeemed_pending" ||
    league.sponsorship_status === "funded"
  ) {
    const max = league.sponsorship_boost_max_cents ?? 0;
    return (
      <View className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4 gap-1">
        <Text className="text-[10px] uppercase tracking-wide font-semibold text-sky-700 dark:text-sky-400">
          Sponsorship
        </Text>
        <Text className="text-sm text-foreground">
          {league.sponsorship_status === "funded"
            ? `PotKeeper boost credited (up to ${formatCents(max)} per your code rules).`
            : `Code linked — up to ${formatCents(max)} unlocks when enough linked members have paid, before the code expires.`}
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {league.sponsorship_status === "forfeited" && (
        <View className="rounded-xl bg-muted/40 px-3 py-2">
          <Text className="text-[11px] text-muted-foreground">
            A previous sponsorship expired before it unlocked. You can try
            another code if you have one.
          </Text>
        </View>
      )}
      <Pressable
        onPress={onToggleOpen}
        className="flex-row items-center gap-2 py-1 active:opacity-80"
      >
        <FontAwesome
          name={sponsorOpen ? "chevron-down" : "chevron-right"}
          size={11}
          color="#64748b"
        />
        <Text className="text-sm font-semibold text-muted-foreground">
          Have a sponsorship code?
        </Text>
      </Pressable>
      {sponsorOpen && (
        <View className="gap-2 pl-1">
          <Text className="text-xs text-muted-foreground">
            Codes from PotKeeper partners or creator kits. Matching is
            case-insensitive.
          </Text>
          <TextInput
            value={sponsorCode}
            onChangeText={onSponsorCodeChange}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="e.g. PKBOOST-FALCONS-2026"
            placeholderTextColor={isDarkColorScheme ? "#666" : "#999"}
            className="rounded-2xl border border-border bg-card px-4 py-3 font-mono text-base"
            style={{
              minHeight: 44,
              color: isDarkColorScheme ? "#FAFAFA" : "#0A0A0F",
            }}
          />
          <Button
            onPress={onApply}
            disabled={sponsorBusy || sponsorCode.trim().length < 4}
            variant="outline"
            className="w-full"
          >
            {sponsorBusy ? (
              <ActivityIndicator />
            ) : (
              <Text className="font-bold">Apply code</Text>
            )}
          </Button>
        </View>
      )}
    </View>
  );
}

function SummaryCard({ league }: { league: League }) {
  const platformLabel =
    league.platform.charAt(0).toUpperCase() + league.platform.slice(1);
  return (
    <View className="rounded-2xl border border-border bg-card p-4 gap-1">
      <Text className="font-semibold" numberOfLines={1}>
        {league.name}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {league.season} · {platformLabel}
        {league.total_rosters != null
          ? ` · ${league.total_rosters} teams`
          : ""}
      </Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1">
        {title}
      </Text>
      <View className="gap-2">{children}</View>
    </View>
  );
}

function BuyInInput({
  valueDollars,
  onChange,
}: {
  valueDollars: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(valueDollars > 0 ? String(valueDollars) : "");
  const { isDarkColorScheme } = useColorScheme();

  // Keep the local text input in sync when presets are tapped.
  useEffect(() => {
    setText(valueDollars > 0 ? String(valueDollars) : "");
  }, [valueDollars]);

  const handleChange = (t: string) => {
    // Whole dollars only for the MVP. We can enable cents later if real users
    // want $X.99 buy-ins (probably never).
    const cleaned = t.replace(/[^0-9]/g, "");
    setText(cleaned);
    onChange(cleaned ? parseInt(cleaned, 10) : 0);
  };

  return (
    <View className="rounded-2xl border border-border bg-card flex-row items-center px-4 py-3 gap-2">
      <Text className="text-3xl font-extrabold text-muted-foreground">$</Text>
      <TextInput
        keyboardType="number-pad"
        value={text}
        onChangeText={handleChange}
        placeholder="0"
        placeholderTextColor={isDarkColorScheme ? "#666" : "#999"}
        className="flex-1 text-3xl font-extrabold text-foreground"
        style={{ minHeight: 40, color: isDarkColorScheme ? "#FAFAFA" : "#0A0A0F" }}
      />
      <Pressable
        onPress={() =>
          onChange(Math.max(0, Math.round(valueDollars / 5) * 5 - 5))
        }
        className="h-9 w-9 rounded-full bg-muted items-center justify-center active:opacity-70"
      >
        <FontAwesome name="minus" size={11} />
      </Pressable>
      <Pressable
        onPress={() => onChange(Math.round(valueDollars / 5) * 5 + 5)}
        className="h-9 w-9 rounded-full bg-muted items-center justify-center active:opacity-70"
      >
        <FontAwesome name="plus" size={11} />
      </Pressable>
    </View>
  );
}

function PresetChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-3 py-1.5 border ${
        selected
          ? "bg-primary border-primary"
          : "bg-card border-border"
      } active:opacity-70`}
    >
      <Text
        className={`text-sm font-semibold ${
          selected ? "text-primary-foreground" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PresetButton({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-2xl border p-4 active:opacity-70 ${
        selected
          ? "border-green-500 bg-green-500/10"
          : "border-border bg-card"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="font-bold">{title}</Text>
          <Text className="text-xs text-muted-foreground mt-0.5">
            {subtitle}
          </Text>
        </View>
        <View
          className={`h-5 w-5 rounded-full items-center justify-center border ${
            selected
              ? "bg-green-500 border-green-500"
              : "border-border"
          }`}
        >
          {selected && <FontAwesome name="check" size={10} color="#fff" />}
        </View>
      </View>
    </Pressable>
  );
}

function PreviewCard({
  buyInCents,
  totalPotCents,
  ranks,
  memberCount,
  feePayer,
}: {
  buyInCents: number;
  totalPotCents: number;
  ranks: Record<string, number>;
  memberCount: number;
  feePayer: "members" | "commissioner";
}) {
  const sortedRanks = Object.entries(ranks)
    .map(([rank, percent]) => ({ rank: Number(rank), percent }))
    .sort((a, b) => a.rank - b.rank);

  // Per-member effective price depends on fee policy.
  const memberPrice =
    feePayer === "members"
      ? Math.round(buyInCents * 1.025)
      : buyInCents;

  return (
    <View className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 gap-3">
      <Text className="text-[10px] uppercase tracking-wide font-semibold text-green-700 dark:text-green-400">
        Preview
      </Text>

      <View className="flex-row gap-6 flex-wrap">
        <View>
          <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Total pot
          </Text>
          <Text className="text-2xl font-extrabold mt-0.5">
            {formatCents(totalPotCents)}
          </Text>
          <Text className="text-[11px] text-muted-foreground mt-0.5">
            {memberCount} × {formatCents(buyInCents)}
          </Text>
        </View>
        <View>
          <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Each member pays
          </Text>
          <Text className="text-2xl font-extrabold mt-0.5">
            {formatCents(memberPrice)}
          </Text>
          <Text className="text-[11px] text-muted-foreground mt-0.5">
            {feePayer === "members" ? "incl. 2.5% fee" : "you cover the fee"}
          </Text>
        </View>
      </View>

      {sortedRanks.length > 0 && (
        <View className="border-t border-green-500/20 pt-3 gap-1">
          <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
            Payouts
          </Text>
          {sortedRanks.map(({ rank, percent }) => (
            <View key={rank} className="flex-row justify-between">
              <Text className="text-sm">
                {rankLabel(rank)} ({percent}%)
              </Text>
              <Text className="text-sm font-bold">
                {formatCents(Math.round(totalPotCents * (percent / 100)))}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return "$0";
  if (cents % 100 === 0) return `$${(cents / 100).toFixed(0)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function rankLabel(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

function readRanks(payoutSplit: Json | null): Record<string, number> | null {
  if (!payoutSplit || typeof payoutSplit !== "object" || Array.isArray(payoutSplit)) {
    return null;
  }
  const ranks = (payoutSplit as { ranks?: unknown }).ranks;
  if (!ranks || typeof ranks !== "object" || Array.isArray(ranks)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(ranks)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}
