import { Alert, Pressable, ScrollView, View } from "react-native";
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
// reconnect entry points, and sign out. The Activity / Tax Center /
// Notifications rows are placeholders for the dedicated screens that
// land in Sprint 5 (W5-6 Tax, W7-8 Notifications, W9-10 Activity).
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

  const showRoadmapStub = (label: string, week: string) =>
    Alert.alert(
      `${label} — coming soon`,
      `Available before NFL kickoff (Sept). On the Sprint 5 roadmap for ${week}.`,
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

        <View className="rounded-2xl border border-border bg-card overflow-hidden">
          <ProfileRow
            icon="bell"
            iconColor="#6366F1"
            title="Notifications"
            subtitle="Manage push + email preferences"
            badge="Sprint 5"
            isFirst
            onPress={() => showRoadmapStub("Notifications", "Weeks 7-8")}
          />
          <ProfileRow
            icon="list-ul"
            iconColor="#22C55E"
            title="Activity"
            subtitle="Buy-ins, payouts, weekly results"
            badge="Sprint 5"
            onPress={() => showRoadmapStub("Activity", "Weeks 9-10")}
          />
          <ProfileRow
            icon="file-text-o"
            iconColor="#F59E0B"
            title="Tax Center"
            subtitle="YTD winnings + 1099-K threshold"
            badge="Sprint 5"
            isLast
            onPress={() => showRoadmapStub("Tax Center", "Weeks 5-6")}
          />
        </View>

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

        <Text className="text-[10px] text-muted-foreground text-center mt-2">
          PotKeeper · v1 preview
        </Text>
      </ScrollView>
    </View>
  );
}

// Generic nav row used for the roadmap stubs (Notifications, Activity,
// Tax Center). Borders are toggled by isFirst / isLast so we can stack
// rows inside a single card-like container without per-row chrome.
function ProfileRow({
  icon,
  iconColor,
  title,
  subtitle,
  badge,
  onPress,
  isFirst,
  isLast,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <View
        className={`flex-row items-center gap-3 px-4 py-3 ${
          isFirst ? "" : "border-t border-border"
        } ${isLast ? "" : ""}`}
      >
        <View
          className="h-9 w-9 rounded-lg items-center justify-center"
          style={{ backgroundColor: `${iconColor}22` }}
        >
          <FontAwesome name={icon} size={14} color={iconColor} />
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-semibold" numberOfLines={1}>
              {title}
            </Text>
            {badge && (
              <View className="rounded-full bg-muted px-1.5 py-0.5">
                <Text className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                  {badge}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-[11px] text-muted-foreground mt-0.5" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <FontAwesome name="chevron-right" size={11} color="#94a3b8" />
      </View>
    </Pressable>
  );
}
