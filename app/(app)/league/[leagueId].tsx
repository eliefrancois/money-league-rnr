import { Alert, Linking, View } from "react-native";
import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { ScrollView, TouchableOpacity, TextInput, Image } from "react-native";
import { SvgUri } from "react-native-svg";
import { Card, CardFooter, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useColorScheme } from "~/lib/useColorScheme";
import { ActivityIndicator } from "react-native";
import { useSession } from "~/context";
import { addOwnerToLeague, createMoneyLeague, getProfileESPNCookies } from "~/utils/supabase";
export interface LeagueDetails {
  current_fantasy_week: number;
  current_nfl_week: number;
  league_id: number;
  name: string;
  standings: TeamStanding[];
  teams: TeamInfo[];
  year: number;
}

export interface TeamStanding {
  logo: string;
  losses: number;
  points_against: number;
  points_for: number;
  team_name: string;
  ties: number;
  wins: number;
}

interface TeamInfo {
  logo: string;
  losses: number;
  points_against: number;
  points_for: number;
  team_name: string;
  team_abbreviation: string;
  ties: number;
  wins: number;
  team_id: number;
}

export default function LeaguePage() {
  const { leagueId } = useLocalSearchParams();
  const [data, setData] = useState<LeagueDetails | null>(null);
  const [buyIn, setBuyIn] = useState<string>("");
  const [buyInSubmitted, setBuyInSubmitted] = useState<boolean>(false);
  const { isDarkColorScheme } = useColorScheme();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { user } = useSession();

  const handleCreateMoneyLeague = async () => {
    try {
      const leagueSize = data?.teams?.length || 0;
      console.log("Creating money league");
      const { error } = await createMoneyLeague(user.id, {
        external_league_id: leagueId,
        buy_in_amount: buyIn,
        league_name: data?.name,
        platform: "espn",
        league_size: leagueSize,
      });
      if (error) {
        console.error("Error creating money league:", error);
        return; // Exit if league creation fails
      }
      console.log("Money league created successfully:", data);

      // Proceed to add owner only if league creation was successful
      const { error: ownerError } = await addOwnerToLeague(user.id, leagueId as string, {
        external_league_id: leagueId,
        has_paid: false,
      });
      if (ownerError) {
        console.error("Error adding owner to league:", ownerError);
      } else {
        console.log("Owner added to league successfully:", data);
      }
    } catch (error) {
      console.error("Error in handleCreateMoneyLeague:", error);
    }
  };

  const handleBuyInSubmit = () => {
    console.log("buyIn", buyIn);
    setBuyInSubmitted(true);
  };

  const handleInvite = (teamName: string) => {
    // Open a text message with the team name
    const message = `Hey! Join our fantasy league: ${data?.name}`;
    const encodedMessage = encodeURIComponent(message);
    const url = `sms:&body=${encodedMessage}`;

    Linking.openURL(url).catch((err) =>
      console.error("An error occurred", err)
    );
    console.log(`Inviting team: ${teamName}`);
    // TODO: Implement invite functionality
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  useFocusEffect(
    useCallback(() => {
      async function fetchLeagueDetails() {
        try {
          setIsLoading(true);
          //Using local storage to get the cookies
          const storedCookies = await SecureStore.getItemAsync("espnCookies");
          // Using supabase to get espn cookies 
          const { data: espnCookies, error } = await getProfileESPNCookies(user.id);

          //if error use local storage
          if (error) {
            console.error("Error fetching espn cookies:", error);
            Alert.alert(
              "Error Fetching League",
              "There was a problem retrieving your league information. Please try again.",
              [
                {
                  text: "OK",
                  onPress: () => console.log("OK Pressed")
                }
              ]
            );
            return;
          }

          const year = new Date().getFullYear();

          if (!storedCookies) {
            // console.warn("No stored cookies found");
            // return
          }
          if (!espnCookies?.espn_s2 && !espnCookies?.espn_swid) {
            console.log("No espn cookies found");
            return Alert.alert("Error Fetching League, Please try again");
          }
          if (leagueId) {
            console.log("leagueId in LeaguePage", leagueId);
          }
          // const parsedCookies = JSON.parse(storedCookies); // TODO: fix this later shouldnt assert presence of cookies i should check if its null or undefined
          const response = await fetch(
            `https://money-league-api.onrender.com/api/user-leagues/details/${leagueId}/${year}`,
            {
              headers: {
                "X-SWID": espnCookies.espn_swid,
                "X-ESPN-S2": espnCookies.espn_s2,
              },
            }
          );
          const responseData = await response.json();
          setData(responseData);
        } catch (error) {
          console.error("Error fetching league details", error);
        } finally {
          setIsLoading(false);
        }
      }
      fetchLeagueDetails();
    }, [leagueId])
  );

  return (
    <>
      <View className="flex-1 items-center justify-center p-4">
        {isLoading && (
          <ActivityIndicator
            size="large"
            color={isDarkColorScheme ? "#00ff00" : "#00ff00"}
          />
        )}
      </View>
      {!isLoading && (
        <ScrollView className="mb-4 w-full ">
          <View className="flex-1 items-center justify-center p-4">
            <Text className="text-lg font-bold"> {data?.name}</Text>
            <Text className="text-base text-gray-600 mb-4">
              Set up your money league
            </Text>
            <View className="flex-row items-center justify-between w-full mt-4 mb-4">
              <TextInput
                className={`flex-1 border border-gray-300 rounded p-2 mr-2 ${
                  buyInSubmitted ? "border-green-500" : "border-gray-300"
                } ${
                  isDarkColorScheme
                    ? "text-white bg-gray-800"
                    : "text-black bg-white"
                }`}
                placeholder="Enter buy-in amount"
                keyboardType="numeric"
                onChangeText={(text) => {
                  if (text.length > 0) {
                    setBuyIn(text);
                  } else {
                    setBuyInSubmitted(false);
                    setBuyIn("");
                  }
                }}
                value={buyIn}
              />
              <Button
                onPress={handleBuyInSubmit}
                className="p-2 bg-blue-500 text-white rounded"
              >
                <Text>Confirm Buy-in fee</Text>
              </Button>
            </View>
            {buyIn && (
              <Text className="text-lg">
                League Pot 💰💰: $
                {formatNumber(parseFloat(buyIn) * (data?.teams?.length || 0))}
              </Text>
            )}
            {data?.standings.map((standing, index) => (
              <Card key={index} className="mb-4 max-w-lg w-full mx-auto">
                <CardHeader>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <View className="w-12 h-12 rounded-full overflow-hidden mr-2">
                        {standing.logo.toLowerCase().endsWith(".svg") ? (
                          <SvgUri width="50" height="50" uri={standing.logo} />
                        ) : (
                          <Image
                            source={{ uri: standing.logo }}
                            style={{ width: "100%", height: "100%" }}
                          />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-base font-bold">
                          #{index + 1} {standing.team_name}
                        </Text>
                        <Text className="text-sm">
                          Record: {standing.wins}-{standing.losses}-
                          {standing.ties}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm">
                          Points For: {standing.points_for}
                        </Text>
                        <Text className="text-sm">
                          Points Against: {standing.points_against}
                        </Text>
                      </View>
                    </View>
                  </View>
                </CardHeader>
                {buyInSubmitted && (
                  <CardFooter>
                    <Button
                      onPress={() => handleInvite(standing.team_name)}
                      className="bg-green-500 text-white rounded p-2"
                    >
                      <Text>Invite</Text>
                    </Button>
                  </CardFooter>
                )}
              </Card>
            ))}
          </View>
        </ScrollView>
      )}
    </>
  );
}
