import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "~/components/ui/text";
import { router, useRouter } from "expo-router";
import { Button } from "~/components/ui/button";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
  League,
  RawPreference,
  RawUserLeaguesData,
  UserLeaguesData,
} from "~/app/api/types/getAllLeaguesAPITypes";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LeagueCard } from "~/components/LeagueCard";
import { getProfileESPNCookies, updateProfile } from "~/utils/supabase";
import { useSession } from "~/context";

export default function ESPNLeagues() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueData, setLeagueData] = useState<UserLeaguesData | null>(null);
  const [storedCookies, setStoredCookies] = useState<string | null>(null);
  const { user } = useSession();

  const parseUserLeagueData = (
    data: RawUserLeaguesData,
    swid: string
  ): UserLeaguesData | null => {
    if (!data || !Array.isArray(data.preferences)) {
      console.error("Invalid data structure");
      return null;
    }

    const leagues = data.preferences.reduce(
      (acc: { [leagueId: string]: League }, pref: RawPreference) => {
        const entry = pref.metaData?.entry;
        const group = entry?.groups[0];
        if (!entry || !group) return acc;

        const leagueId = group.groupId;
        acc[leagueId] = {
          teamName: entry.entryMetadata.teamName,
          teamAbbrev: entry.entryMetadata.teamAbbrev,
          active: entry.entryMetadata.active,
          draftComplete: entry.entryMetadata.draftComplete,
          draftInProgress: entry.entryMetadata.draftInProgress,
          inSeason: pref.metaData.inSeason,
          isLive: pref.metaData.isLive,
          currentScoringPeriodId: pref.metaData.currentScoringPeriodId,
          teamId: entry.entryId,
          teamWins: entry.wins || 0,
          teamLosses: entry.losses || 0,
          teamTies: entry.ties || 0,
          teamRank: entry.rank || 0,
          teamPoints: entry.points || 0,
          teamLogo: entry.logoUrl,
          leagueName: group.groupName,
          leagueManager: group.groupManager,
          seasonId: entry.seasonId,
        };
        return acc;
      },
      {}
    );

    return {
      leagues,
      profile: {
        lastName: data.profile.lastName,
        firstName: data.profile.firstName,
        email: data.profile.email,
        userName: data.profile.userName,
        swid: swid,
      },
    };
  };
  const fetchAndParseLeagueData = useCallback(async (cookies: string) => {
    try {
      setIsLoading(true);
      setError(null);
      console.log("in fetchAndParseLeagueData() calling Flask API");
      // console.log("storedCookies:", storedCookies);
      // console.log("Using hardcoded cookies:", storedCookies);

      const parsedCookies = JSON.parse(cookies);
      console.log("parsedCookies:", parsedCookies);

      // if (!parsedCookies.SWID || !parsedCookies.espn_s2) {
      //   Alert.alert("Missing SWID or espn_s2 cookie.");
      //   router.push("/");
      //   console.log("Missing SWID or espn_s2 cookie.");
      //   return;
      //   // throw new Error("Missing SWID or espn_s2 cookie.");
      // }
      // console.log("parsedCookies.SWID:", parsedCookies.SWID);
      // console.log("parsedCookies.espn_s2:", parsedCookies.espn_s2);
      const response = await fetch(
        "https://money-league-api.onrender.com/api/user-leagues",
        {
          method: "GET",
          headers: {
            "X-SWID": parsedCookies.espn_swid,
            "X-ESPN-S2": parsedCookies.espn_s2,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const rawData: RawUserLeaguesData = await response.json();
      console.log("Flask API response parsing now ");
      const parsedData = parseUserLeagueData(rawData, parsedCookies.espn_swid);
      if (!parsedData) {
        console.log("No data parsed");
        return;
      } else {
        console.log("Done Parsing League Data");
      }

      setLeagueData(parsedData);
      await AsyncStorage.setItem("leagueData", JSON.stringify(parsedData));
      await AsyncStorage.setItem("leagueDataUser", parsedCookies.espn_swid);
      console.log("League Data saved to Async Storage");
    } catch (error) {
      console.error("Error fetching league data:", error);
      setError("Failed to fetch league data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const fetchLeagues = async () => {
        try {
          console.log("Checking SecureStore for ESPN Cookies");
          const storedCookies = await SecureStore.getItemAsync("espnCookies");

          if (storedCookies !== null) {
            const parsedCookies = JSON.parse(storedCookies);
            console.log("parsedCookies.SWID:", parsedCookies.SWID);
            console.log("parsedCookies.espn_s2:", parsedCookies.espn_s2);
            await fetchAndParseLeagueData(storedCookies);
          }
          else {
            console.log("No Cookies in SecureStore, pulling from DB");
            const { data, error } = await getProfileESPNCookies(user.id);
            if (error) {
              console.error("Error fetching profile:", error);
            } else {
              if (data?.espn_s2 && data?.espn_swid) {
                const cookies = JSON.stringify({ espn_s2: data.espn_s2, espn_swid: data.espn_swid });
                await fetchAndParseLeagueData(cookies);
              }
            }
          }
        } catch (error) {
          console.error("Error fetching data:", error);
          setError("Failed to fetch league data. Please try again.");
        }
      };
      fetchLeagues();
    }, [storedCookies])
  );

  return (
    <>
      {isLoading && (
        <View className="flex-1 justify-center items-center gap-5 p-6 bg-secondary/30">
          <ActivityIndicator size="large" />
        </View>
      )}
      {error && (
        <View className="flex-1 justify-center items-center gap-5 p-6 bg-secondary/30">
          <Text>{error}</Text>
        </View>
      )}
      {!isLoading && !error && (
        <View className="flex-1 justify-center items-center gap-5 p-6 bg-secondary/30">
          <Text className="text-2xl font-bold">Select a League to Connect</Text>
          {leagueData && (
            <ScrollView className="w-full">
              <View className="w-full">
                {Object.entries(leagueData.leagues).map(
                  ([leagueId, league]) => (
                    <LeagueCard
                      key={`${leagueId}-${league.teamId}`}
                      league={league}
                      leagueId={leagueId}
                    />
                  )
                )}
              </View>
            </ScrollView>
          )}
        </View>
      )}
    </>
  );
}
