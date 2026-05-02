import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
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
}

export default function SleeperLinkScreen() {
  const [step, setStep] = useState<Step>("username");
  const [sleeperUser, setSleeperUser] = useState<SleeperUser | null>(null);
  const [leagues, setLeagues] = useState<SleeperLeague[]>([]);
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
      setSeason(DEFAULT_SEASON);
      setLoading(false);
      setSuccess(null);
    }, []),
  );

  const handleLookupUsername = async (username: string) => {
    if (!username.trim()) return;
    setLoading(true);
    try {
      const sleeperResult = await getSleeperUser(username.trim());
      const leagueResult = await getSleeperUserLeagues(sleeperResult.user_id, DEFAULT_SEASON);
      setSleeperUser(sleeperResult);
      setLeagues(leagueResult);
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
      setLeagues(leagueResult);
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
  season,
  loading,
  onSeasonChange,
  onImport,
  onBack,
}: {
  sleeperUser: SleeperUser;
  leagues: SleeperLeague[];
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
          <LeagueCard key={league.league_id} league={league} onImport={onImport} />
        ))
      )}
    </ScrollView>
  );
}

function LeagueCard({
  league,
  onImport,
}: {
  league: SleeperLeague;
  onImport: (l: SleeperLeague) => void;
}) {
  const statusBadge = formatStatus(league.status);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{league.name}</CardTitle>
        <View className="flex-row items-center gap-2 mt-1">
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
      <CardContent>
        <Button onPress={() => onImport(league)}>
          <Text>Add to PotKeeper</Text>
        </Button>
      </CardContent>
    </Card>
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
      <View className="w-full gap-2">
        <Button onPress={onViewLeague} className="w-full">
          <Text>View league</Text>
        </Button>
        <Button onPress={onDone} variant="ghost" className="w-full">
          <Text>Back to home</Text>
        </Button>
      </View>
    </View>
  );
}
