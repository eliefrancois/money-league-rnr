import { League } from "~/app/api/types/getAllLeaguesAPITypes";
import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { View, StyleSheet, TouchableOpacity, Pressable } from "react-native";
import { SvgUri } from "react-native-svg";
import { Card, CardContent, CardFooter } from "./ui/card";
import { Button } from "./ui/button";
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

const styles = StyleSheet.create({
  touchable: {
    width: "100%",
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    justifyContent: "space-between",
    alignItems: "center",
  },
  contentContainer: {
    flex: 1,
    flexDirection: "row",
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  infoContainer: {
    flex: 1,
    marginLeft: 15,
  },
  leagueName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  teamName: {
    fontSize: 16,
    marginBottom: 5,
  },
  record: {
    fontSize: 14,
    color: "#666",
  },
  rank: {
    fontSize: 14,
    color: "#666",
  },
  plusButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "black",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginLeft: 10,
  },
});
