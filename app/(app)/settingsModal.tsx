import { Alert, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { Text } from "~/components/ui/text";
import { useSession } from "~/context";
import { useProfile } from "~/context/profile";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";


export default function ModalScreen() {
  const { signOut, user } = useSession();
  const { profile } = useProfile();

  async function handleSignOut(): Promise<void> {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Sign Out",
        onPress: async () => {
          try {
            await signOut();
          } catch (error) {
            console.error("Error signing out", error);
            Alert.alert("Error", "Failed to sign out");
          }
        },
      },
    ]);
  }

  // Match the wallet screen's state derivation so the chip here doesn't
  // disagree with what /wallet shows.
  //
  // Product decision (Session 4): we defer the SSN/KYC ask until the user
  // actually has winnings queued (matches DraftKings, FanDuel, Underdog,
  // PrizePicks). For users who haven't started onboarding yet, we don't
  // surface the CTA at all from settings — the natural trigger will be a
  // payout-required prompt on the league detail / home screen post-season.
  // Users who *have* started onboarding still see status here so they can
  // resume or confirm it's active.
  const payoutsEnabled = profile?.stripe_payouts_enabled === true;
  const onboardingStarted = profile?.stripe_account_id != null;
  const payoutLabel = payoutsEnabled ? "Payouts enabled" : "Setup in progress";
  const payoutVariant = payoutsEnabled ? "outline" : "default";

  return (
        <View style={styles.container}>
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-center">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <View>
                <Text className="font-bold">Name</Text>
                <Text>{user?.user_metadata?.full_name || 'Not set'}</Text>
              </View>
              <View>
                <Text className="font-bold">Email</Text>
                <Text>{user?.email || 'Not set'}</Text>
              </View>
              {onboardingStarted ? (
                <View className="gap-2">
                  <Text className="font-bold">Payouts</Text>
                  <Button
                    variant={payoutVariant}
                    onPress={() => router.push("/(app)/wallet")}
                  >
                    <View className="flex-row items-center gap-2">
                      {payoutsEnabled ? (
                        <FontAwesome name="check-circle" size={14} color="#22C55E" />
                      ) : null}
                      <Text className={payoutsEnabled ? "" : "text-primary-foreground"}>
                        {payoutLabel}
                      </Text>
                    </View>
                  </Button>
                </View>
              ) : null}
              <View>
                <Text className="font-bold">ESPN</Text>
                <Button variant="outline" onPress={() => {/* ESPN sync logic */}}>
                  <Text>Sync ESPN</Text>
                </Button>
              </View>
              <View>
                <Text className="font-bold">Sleeper</Text>
                <Button variant="outline" onPress={() => {/* Sleeper sync logic */}}>
                  <Text>Sync Sleeper</Text>
                </Button>
              </View>
            </CardContent>
            <CardFooter>
              <Button
                variant="destructive"
                className="w-full"
                onPress={() => handleSignOut()}
              >
                <Text className="text-white">Sign Out</Text>
              </Button>
            </CardFooter>
          </Card>
        </View>
      );
    }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
});
