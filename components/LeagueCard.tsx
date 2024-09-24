import { League } from "~/app/api/types/getAllLeaguesAPITypes";
import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { View, Pressable } from "react-native";
import { SvgUri } from "react-native-svg";
import { Card, CardContent } from "./ui/card";
import { Text } from "./ui/text";
import { useColorScheme } from "~/lib/useColorScheme";

interface LeagueCardProps {
  league: League;
  leagueId: string;
}

export const LeagueCard: React.FC<LeagueCardProps> = ({ league, leagueId }) => {
  const { isDarkColorScheme } = useColorScheme();
  return (
    <Card className="w-full mb-4">
      <CardContent className="flex-row items-center justify-between p-4">
        <View className="flex-row items-center flex-1 mr-4">
          <SvgUri width="60" height="60" uri={league.teamLogo} />
          <View className="ml-4 flex-1">
            <Text
              className="text-lg font-bold"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {league.leagueName}
            </Text>
            <Text className="text-base" numberOfLines={1} ellipsizeMode="tail">
              {league.teamName}
            </Text>
            <Text className="text-sm text-gray-600">
              Record: {league.teamWins}-{league.teamLosses}-{league.teamTies}
            </Text>
          </View>
        </View>
        {league.inSeason && (
          <Pressable
            onPress={() => {
              router.push({
                pathname: "/league/[leagueId]",
                params: { leagueId: leagueId },
              });
            }}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.5 : 1,
              },
            ]}
          >
            <FontAwesome
              name="plus"
              size={24}
              color={isDarkColorScheme ? "white" : "black"}
            />
          </Pressable>
        )}
      </CardContent>
    </Card>
  );
};
