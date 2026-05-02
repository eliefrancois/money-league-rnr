import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import {
  getSleeperAvatarUrl,
  getSleeperUser,
  getSleeperUserLeagues,
  SleeperUserNotFoundError,
  type SleeperLeague,
  type SleeperUser,
} from "~/lib/sleeper";
import { supabase } from "~/utils/supabase";

// Per-Sleeper-league lookup used to render the LeaguesStep with the right
// state on the Add/View/Notify-commish button. Built from a single query
// against `leagues` after the Sleeper API returns. RLS ensures we only see
// leagues we're already a member of, which is exactly what we need: any
// row missing from this map is treated as "not yet imported".
interface ExistingLeagueState {
  potkeeperLeagueId: string;
  iAmCommissioner: boolean;
  commissionerDisplayName: string | null;
}

// Default to last completed season — most users will have leagues there. Lets us
// avoid empty results in pre-season months. Year-picker on the leagues step.
const DEFAULT_SEASON = "2025";
const SEASON_OPTIONS = ["2026", "2025", "2024", "2023"] as const;

type Step = "username" | "leagues" | "importing" | "success";

interface ImportSuccess {
  leagueId: string;
  leagueName: string;
  memberCount: number;
  alreadyExisted: boolean;
  // True when the Sleeper user we just imported as is the league's
  // commissioner — gates the "Have a sponsorship code?" hint, since the
  // redeem-sponsorship-code Edge Function only accepts the commissioner.
  isCommissioner: boolean;
}

export default function SleeperLinkScreen() {
  const [step, setStep] = useState<Step>("username");
  const [sleeperUser, setSleeperUser] = useState<SleeperUser | null>(null);
  const [leagues, setLeagues] = useState<SleeperLeague[]>([]);
  const [existingMap, setExistingMap] = useState<
    Map<string, ExistingLeagueState>
  >(new Map());
  const [season, setSeason] = useState<string>(DEFAULT_SEASON);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<ImportSuccess | null>(null);

  // The screen lives inside the Tabs navigator (with href: null) so it stays
  // mounted between visits. Without this reset, re-entering after a successful
  // import would land you back on the success step with the previous league.
  useFocusEffect(
    useCallback(() => {
      setStep("username");
      setSleeperUser(null);
      setLeagues([]);
      setExistingMap(new Map());
      setSeason(DEFAULT_SEASON);
      setLoading(false);
      setSuccess(null);
    }, []),
  );

  // Cross-checks the Sleeper league list against PotKeeper's leagues table so
  // the LeaguesStep can render "Already added" / "View league" / "Notify
  // commish" instead of always offering "Add to PotKeeper". RLS scopes the
  // results to leagues this user is already a member of — which is exactly
  // when we want the alternate states.
  const fetchExistingPotKeeperLeagues = async (
    sleeperLeagues: SleeperLeague[],
  ): Promise<Map<string, ExistingLeagueState>> => {
    if (sleeperLeagues.length === 0) return new Map();
    const externalIds = sleeperLeagues.map((l) => l.league_id);

    const { data: existing, error } = await supabase
      .from("leagues")
      .select(
        "id, external_league_id, commissioner_external_user_id, commissioner_profile_id",
      )
      .eq("platform", "sleeper")
      .in("external_league_id", externalIds);

    if (error) {
      console.warn("[sleeper-link] failed to fetch existing leagues:", error.message);
      return new Map();
    }
    if (!existing || existing.length === 0) return new Map();

    // Pull a display name for the commissioner so the "Notify commish" share
    // sheet can name them. We use league_members because the commissioner's
    // PotKeeper profile may not be linked yet (they may not have signed up).
    const commishExternalIds = existing
      .map((l) => l.commissioner_external_user_id)
      .filter((v): v is string => typeof v === "string");
    const commishNameByExternalId = new Map<string, string>();
    if (commishExternalIds.length > 0) {
      const { data: commishMembers } = await supabase
        .from("league_members")
        .select("external_user_id, external_display_name, external_username, team_name")
        .in("external_user_id", commishExternalIds)
        .eq("is_owner", true);
      for (const m of commishMembers ?? []) {
        const name =
          m.external_display_name ?? m.external_username ?? m.team_name ?? null;
        if (name && !commishNameByExternalId.has(m.external_user_id)) {
          commishNameByExternalId.set(m.external_user_id, name);
        }
      }
    }

    const profileId = (await supabase.auth.getSession()).data.session?.user.id;
    const map = new Map<string, ExistingLeagueState>();
    for (const row of existing) {
      map.set(row.external_league_id, {
        potkeeperLeagueId: row.id,
        iAmCommissioner:
          row.commissioner_profile_id != null &&
          row.commissioner_profile_id === profileId,
        commissionerDisplayName:
          row.commissioner_external_user_id != null
            ? commishNameByExternalId.get(row.commissioner_external_user_id) ?? null
            : null,
      });
    }
    return map;
  };

  const handleLookupUsername = async (username: string) => {
    if (!username.trim()) return;
    setLoading(true);
    try {
      const sleeperResult = await getSleeperUser(username.trim());
      const leagueResult = await getSleeperUserLeagues(sleeperResult.user_id, DEFAULT_SEASON);
      const map = await fetchExistingPotKeeperLeagues(leagueResult);
      setSleeperUser(sleeperResult);
      setLeagues(leagueResult);
      setExistingMap(map);
      setStep("leagues");
    } catch (err) {
      if (err instanceof SleeperUserNotFoundError) {
        Alert.alert("User not found", `No Sleeper user named "${username}" exists.`);
      } else {
        const message = err instanceof Error ? err.message : "Unknown error";
        Alert.alert("Sleeper error", message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSeasonChange = async (newSeason: string) => {
    if (!sleeperUser) return;
    setSeason(newSeason);
    setLoading(true);
    try {
      const leagueResult = await getSleeperUserLeagues(sleeperUser.user_id, newSeason);
      const map = await fetchExistingPotKeeperLeagues(leagueResult);
      setLeagues(leagueResult);
      setExistingMap(map);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Sleeper error", message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportLeague = async (league: SleeperLeague) => {
    if (!sleeperUser) return;

    // SessionProvider blocks until auth has hydrated, so by the time this
    // screen mounts the Supabase client either has a valid session or the
    // RoutingGate has already kicked the user back to /(signIn). functions.invoke
    // auto-attaches the access_token from the persisted session.
    setStep("importing");
    try {
      const { data, error } = await supabase.functions.invoke("sleeper-import-league", {
        body: {
          league_id: league.league_id,
          season: league.season,
          importer_external_user_id: sleeperUser.user_id,
        },
      });
      if (error) throw error;
      if (!data?.league?.id) {
        throw new Error("Edge function returned no league id");
      }
      setSuccess({
        leagueId: data.league.id,
        leagueName: league.name,
        memberCount: (data?.members ?? []).length,
        alreadyExisted: data?.already_existed ?? false,
        isCommissioner:
          data?.league?.commissioner_external_user_id != null &&
          data.league.commissioner_external_user_id === sleeperUser.user_id,
      });
      setStep("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Import failed", message);
      setStep("leagues");
    }
  };

  if (step === "username") {
    return <UsernameStep onSubmit={handleLookupUsername} loading={loading} />;
  }

  if (step === "leagues" && sleeperUser) {
    return (
      <LeaguesStep
        sleeperUser={sleeperUser}
        leagues={leagues}
        existingMap={existingMap}
        season={season}
        loading={loading}
        onSeasonChange={handleSeasonChange}
        onImport={handleImportLeague}
        onBack={() => setStep("username")}
      />
    );
  }

  if (step === "importing") {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-secondary/30">
        <ActivityIndicator size="large" />
        <Text>Importing league + members…</Text>
      </View>
    );
  }

  if (step === "success" && success) {
    return (
      <SuccessStep
        success={success}
        onViewLeague={() =>
          router.replace({
            pathname: "/league/[id]",
            params: { id: success.leagueId },
          })
        }
        onDone={() => router.replace("/")}
      />
    );
  }

  return null;
}

// =============================================================================
// Step 1: Username input
// =============================================================================

function UsernameStep({
  onSubmit,
  loading,
}: {
  onSubmit: (username: string) => void;
  loading: boolean;
}) {
  const [username, setUsername] = useState("");
  return (
    <ScrollView contentContainerClassName="flex-grow p-6 gap-6 bg-secondary/30">
      <Card>
        <CardHeader>
          <CardTitle>Enter your Sleeper username</CardTitle>
          <CardDescription>
            We'll find all the leagues you're in. No password required.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          <Input
            placeholder="ef2467"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            onSubmitEditing={() => onSubmit(username)}
            returnKeyType="search"
          />
          <Button onPress={() => onSubmit(username)} disabled={loading || !username.trim()}>
            {loading ? <ActivityIndicator /> : <Text>Find My Leagues</Text>}
          </Button>
        </CardContent>
      </Card>

      <Text className="text-xs text-muted-foreground text-center">
        Your Sleeper username is what shows in-app under Settings → Account.
      </Text>
    </ScrollView>
  );
}

// =============================================================================
// Step 2: Leagues list
// =============================================================================

function LeaguesStep({
  sleeperUser,
  leagues,
  existingMap,
  season,
  loading,
  onSeasonChange,
  onImport,
  onBack,
}: {
  sleeperUser: SleeperUser;
  leagues: SleeperLeague[];
  existingMap: Map<string, ExistingLeagueState>;
  season: string;
  loading: boolean;
  onSeasonChange: (s: string) => void;
  onImport: (l: SleeperLeague) => void;
  onBack: () => void;
}) {
  const avatarUrl = getSleeperAvatarUrl(sleeperUser.avatar);
  const initial = (sleeperUser.display_name ?? sleeperUser.username ?? "?")[0]?.toUpperCase();

  return (
    <ScrollView contentContainerClassName="p-6 gap-4 bg-secondary/30">
      <View className="flex-row items-center gap-3">
        <Avatar alt={sleeperUser.display_name ?? "Sleeper avatar"}>
          {avatarUrl ? <AvatarImage source={{ uri: avatarUrl }} /> : null}
          <AvatarFallback>
            <Text>{initial}</Text>
          </AvatarFallback>
        </Avatar>
        <View className="flex-1">
          <Text className="font-semibold">{sleeperUser.display_name ?? sleeperUser.username}</Text>
          <Text className="text-xs text-muted-foreground">@{sleeperUser.username ?? "unknown"}</Text>
        </View>
        <Button variant="ghost" size="sm" onPress={onBack}>
          <Text>Change</Text>
        </Button>
      </View>

      <View className="flex-row gap-2">
        {SEASON_OPTIONS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === season ? "default" : "outline"}
            onPress={() => onSeasonChange(s)}
            disabled={loading}
          >
            <Text>{s}</Text>
          </Button>
        ))}
      </View>

      {loading ? (
        <View className="items-center py-8">
          <ActivityIndicator />
        </View>
      ) : leagues.length === 0 ? (
        <Card>
          <CardContent className="py-8 items-center gap-2">
            <Text className="text-muted-foreground">No leagues for {season}</Text>
            <Text className="text-xs text-muted-foreground">Try another season above.</Text>
          </CardContent>
        </Card>
      ) : (
        leagues.map((league) => (
          <LeagueCard
            key={league.league_id}
            league={league}
            existing={existingMap.get(league.league_id) ?? null}
            onImport={onImport}
          />
        ))
      )}
    </ScrollView>
  );
}

function LeagueCard({
  league,
  existing,
  onImport,
}: {
  league: SleeperLeague;
  existing: ExistingLeagueState | null;
  onImport: (l: SleeperLeague) => void;
}) {
  const statusBadge = formatStatus(league.status);
  const isImported = existing != null;

  // Subdued styling when the league is already in PotKeeper — keeps the
  // visual hierarchy on actionable rows (the brand-new leagues the user
  // came here to import).
  const cardClassName = isImported ? "opacity-70" : undefined;

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <View className="flex-row items-start justify-between gap-2">
          <CardTitle>{league.name}</CardTitle>
          {isImported && (
            <View className="rounded-full bg-green-500/15 px-2 py-0.5">
              <Text className="text-[10px] font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
                Already added
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
          <Text className="text-xs text-muted-foreground">
            {league.season} · {league.total_rosters ?? "?"} teams
          </Text>
          {statusBadge && (
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text className="text-[10px] font-medium uppercase">{statusBadge}</Text>
            </View>
          )}
        </View>
      </CardHeader>
      <CardContent className="gap-2">
        {isImported && existing ? (
          <ImportedLeagueActions league={league} existing={existing} />
        ) : (
          <Button onPress={() => onImport(league)}>
            <Text>Add to PotKeeper</Text>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ImportedLeagueActions({
  league,
  existing,
}: {
  league: SleeperLeague;
  existing: ExistingLeagueState;
}) {
  const handleViewLeague = () =>
    router.push({
      pathname: "/league/[id]",
      params: { id: existing.potkeeperLeagueId },
    });

  // No push/email backend yet (parked under p3) — Share sheet gives the user
  // a real way to nudge their commissioner via iMessage, Discord, group
  // chat, etc. Copy is short + carries the league deep link so the commish
  // lands on the right Pot tab where the "Set up the pot" CTA already lives.
  const handleNotifyCommish = async () => {
    const commishLabel = existing.commissionerDisplayName ?? "the commissioner";
    const message =
      `Hey ${commishLabel} — our Sleeper league "${league.name}" is on PotKeeper but the pot isn't set up yet. ` +
      `Can you finish the buy-in setup? Open in PotKeeper.`;
    try {
      await Share.share({ message });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Couldn't open share sheet", detail);
    }
  };

  return (
    <View className="gap-2">
      <Button onPress={handleViewLeague} variant="secondary">
        <View className="flex-row items-center gap-2">
          <FontAwesome name="arrow-right" size={12} />
          <Text>View league</Text>
        </View>
      </Button>
      {!existing.iAmCommissioner && (
        <Button onPress={handleNotifyCommish} variant="outline">
          <View className="flex-row items-center gap-2">
            <FontAwesome name="bell" size={12} />
            <Text>
              Notify {existing.commissionerDisplayName ?? "commish"}
            </Text>
          </View>
        </Button>
      )}
    </View>
  );
}

function formatStatus(status?: string | null): string | null {
  if (!status) return null;
  if (status === "complete") return "Season complete";
  if (status === "in_season") return "In season";
  if (status === "drafting") return "Drafting";
  if (status === "pre_draft") return "Pre-draft";
  return status.replace(/_/g, " ");
}

// =============================================================================
// Step 3: Success
// =============================================================================

function SuccessStep({
  success,
  onViewLeague,
  onDone,
}: {
  success: ImportSuccess;
  onViewLeague: () => void;
  onDone: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-6 p-6 bg-secondary/30">
      <FontAwesome name="check-circle" size={64} color="#22c55e" />
      <View className="items-center gap-2">
        <Text className="text-xl font-bold">
          {success.alreadyExisted ? "Already imported" : "Imported!"}
        </Text>
        <Text className="text-center text-muted-foreground">
          {success.leagueName} · {success.memberCount} members
        </Text>
      </View>
      <View className="w-full gap-3 max-w-sm">
        <Button onPress={onViewLeague} className="w-full">
          <Text>View league</Text>
        </Button>
        {success.isCommissioner && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/league/[id]/buy-in",
                params: { id: success.leagueId },
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
        )}
        <Button onPress={onDone} variant="ghost" className="w-full">
          <Text>Back to home</Text>
        </Button>
      </View>
    </View>
  );
}
