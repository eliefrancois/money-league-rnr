import { Linking, StyleSheet, Text, View } from "react-native";
import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { ScrollView, TouchableOpacity, TextInput, Image} from "react-native";
import { SvgUri } from "react-native-svg";

export default function LeaguePage() {
  const { leagueId } = useLocalSearchParams();
  const [data, setData] = useState<LeagueDetails | null>(null);
  const [buyIn, setBuyIn] = useState<string>("");
  const [buyInSubmitted, setBuyInSubmitted] = useState<boolean>(false);

  interface LeagueDetails {
    current_fantasy_week: number;
    current_nfl_week: number;
    league_id: number;
    name: string;
    standings: TeamStanding[];
    teams: TeamInfo[];
    year: number;
  }

  interface TeamStanding {
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
    ties: number;
    wins: number;
  }

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

  useEffect(() => {
    async function fetchLeagueDetails() {
      const storedCookies = await SecureStore.getItemAsync("espnCookies");
      const year = new Date().getFullYear();
      console.log("year in LeaguePage", year);
      if (!storedCookies) {
        console.error("No stored cookies found");
        return;
      }
      if (leagueId) {  
        console.log("leagueId in LeaguePage", leagueId);
      }
      const parsedCookies = JSON.parse(storedCookies); // TODO: fix this later shouldnt assert presence of cookies i should check if its null or undefined
      const response = await fetch(
        `http://10.0.0.161:5001/api/user-leagues/details/${leagueId}/${year}`,
        {
          headers: {
            "X-SWID": parsedCookies.SWID,
            "X-ESPN-S2": parsedCookies.espn_s2,
          },
        }
      );
      const responseData = await response.json();
      setData(responseData);
      console.log(
        "data from Flask API: /api/user-leagues/details/<string:league_id>/<string:year>",
        data
      );
    }
    fetchLeagueDetails();
  }, []);

  return (
    <>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
        >
          <Text> League Name: {data?.name}</Text>
          <View style={styles.buyInContainer}>
            <Text style={styles.buyInLabel}>League Buy-in:</Text>
            <TextInput
              style={styles.buyInInput}
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
          </View>
          {buyIn && (
            <View style={styles.buyInContainer}>
              <Text>
                League Pot: $
                {formatNumber(parseFloat(buyIn) * (data?.teams?.length || 0))}
              </Text>
              <TouchableOpacity
                style={styles.buyInButton}
                onPress={handleBuyInSubmit}
              >
                <Text style={styles.buyInButtonText}>Confirm Buy-in fee</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* TODO: iterate through the teams and display them */}
          {data?.standings.map((standing, index) => (
            <View key={index} style={styles.card}>
            <View style={styles.cardContent}>
              <View style={styles.teamInfoContainer}>
                <View style={styles.logoContainer}>
                  {standing.logo.toLowerCase().endsWith('.svg') ? (
                    <SvgUri
                      width="50"
                      height="50"
                      uri={standing.logo}
                      style={styles.logo}
                    />
                  ) : (
                    <Image
                      source={{ uri: standing.logo }}
                      style={styles.logo}
                    />
                  )}
                </View>
                <View style={styles.teamDetails}>
                  <Text style={styles.teamName}>
                    #{index + 1} {standing.team_name}
                  </Text>
                  <Text style={styles.record}>
                    Record: {standing.wins}-{standing.losses}-{standing.ties}
                  </Text>
                </View>
              </View>
              <Text style={styles.points}>
                Points For: {standing.points_for}
              </Text>
              <Text style={styles.points}>
                Points Against: {standing.points_against}
              </Text>
            </View>
              {buyInSubmitted && (
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => handleInvite(standing.team_name)}
                >
                  <Text style={styles.inviteButtonText}>Invite</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollViewContent: {
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
    width: "100%",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    margin: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#f9f9f9",
  },
  cardContent: {
    flex: 1,
  },
  teamName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  record: {
    fontSize: 16,
  },
  points: {
    fontSize: 16,
  },
  buyInContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    margin: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#f9f9f9",
  },
  buyInLabel: {
    fontSize: 16,
    fontWeight: "bold",
  },
  buyInInput: {
    flex: 1,
    marginLeft: 10,
    padding: 5,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  buyInButton: {
    padding: 10,
    margin: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#f9f9f9",
  },
  buyInButtonText: {
    fontSize: 16,
  },
  inviteButton: {
    padding: 10,
    margin: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#f9f9f9",
  },
  inviteButtonText: {
    fontSize: 16,
  },

  teamInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  logoContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    marginRight: 10,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  teamDetails: {
    flex: 1,
  },
});
