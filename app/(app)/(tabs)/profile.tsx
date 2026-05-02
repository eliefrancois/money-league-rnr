import { Alert, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "~/components/ui/text";
import { ThemeToggle } from "~/components/ThemeToggle";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { useSession } from "~/context";
import { useProfile } from "~/context/profile";

// Profile tab — replaces the old settingsModal. This is our "Profile lite"
// in v1 (per APP_FLOW Screen 10.1): account info, payouts status, platform
// reconnect entry points, and sign out. Wins history + tax center will
// land in Sprint 5 once we have completed seasons / 1099-MISC eligibility.
export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const { signOut, user } = useSession();
  const { profile } = useProfile();

  // Match the wallet screen's state derivation so the chip here doesn't
  // disagree with what /wallet shows. Per Session 4 product decision we
  // defer the SSN/KYC ask until winnings are queued — so users who
  // haven't started Stripe Connect onboarding don't see the CTA at all.
  const payoutsEnabled = profile?.stripe_payouts_enabled === true;
  const onboardingStarted = profile?.stripe_account_id != null;
  const payoutLabel = payoutsEnabled ? "Payouts enabled" : "Setup in progress";

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        onPress: async () => {
          try {
            await signOut();
          } catch (err) {
            console.error("Error signing out", err);
            Alert.alert("Error", "Failed to sign out");
          }
        },
      },
    ]);
  };

  const handleSyncEspn = () =>
    Alert.alert(
      "Coming soon",
      "ESPN sync is being rebuilt with secure cookie storage. Available next session.",
    );

  return (
    <View className="flex-1 bg-secondary/30">
      <View
        className="px-5 pb-2 flex-row items-center justify-between"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Text className="text-2xl font-extrabold tracking-tight">Profile</Text>
        <ThemeToggle />
      </View>

      <ScrollView contentContainerClassName="p-5 gap-4 pb-10">
        <Card>
          <CardContent className="p-4 gap-3">
            <View>
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Name
              </Text>
              <Text className="text-base font-semibold mt-1">
                {user?.user_metadata?.full_name || "Not set"}
              </Text>
            </View>
            <View>
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Email
              </Text>
              <Text className="text-base mt-1">{user?.email || "Not set"}</Text>
            </View>
          </CardContent>
        </Card>

        {onboardingStarted && (
          <Card>
            <CardContent className="p-4 gap-2">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Payouts
              </Text>
              <Button
                variant={payoutsEnabled ? "outline" : "default"}
                onPress={() => router.push("/(app)/wallet")}
              >
                <View className="flex-row items-center gap-2">
                  {payoutsEnabled && (
                    <FontAwesome name="check-circle" size={14} color="#22C55E" />
                  )}
                  <Text>{payoutLabel}</Text>
                </View>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 gap-3">
            <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Connected accounts
            </Text>
            <Button variant="outline" onPress={() => router.push("/sleeper-link")}>
              <Text>Sync Sleeper</Text>
            </Button>
            <Button variant="outline" onPress={handleSyncEspn}>
              <Text>Sync ESPN</Text>
            </Button>
          </CardContent>
        </Card>

        <Button variant="destructive" onPress={handleSignOut}>
          <Text className="text-white">Sign out</Text>
        </Button>
      </ScrollView>
    </View>
  );
}
