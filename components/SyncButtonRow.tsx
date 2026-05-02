import { Alert, Image, View } from "react-native";
import { router } from "expo-router";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";

// Shared platform sync row used by Home (empty state) and the Leagues tab.
// Sleeper is live; ESPN + Yahoo are placeholders that surface a "coming soon"
// alert so users know the connectors exist on the roadmap.
export function SyncButtonRow({ compact = false }: { compact?: boolean }) {
  const handleSyncSleeper = () => router.push("/sleeper-link");
  const handleSyncEspn = () =>
    Alert.alert(
      "Coming soon",
      "ESPN sync is being rebuilt with secure cookie storage. Available in the next session.",
    );
  const handleSyncYahoo = () =>
    Alert.alert(
      "Coming soon",
      "Yahoo Fantasy support is planned for v2 (OAuth required).",
    );

  return (
    <View className={compact ? "gap-2" : "gap-3 w-full max-w-sm"}>
      <Button onPress={handleSyncSleeper} variant={compact ? "outline" : "default"}>
        <View className="flex-row items-center gap-2">
          <Image
            source={require("~/assets/league_sync/sleeper_icon.jpg")}
            style={{ width: 22, height: 22, borderRadius: 4 }}
          />
          <Text>Sync Sleeper</Text>
        </View>
      </Button>
      <Button onPress={handleSyncEspn} variant={compact ? "outline" : "secondary"}>
        <View className="flex-row items-center gap-2">
          <Image
            source={require("~/assets/league_sync/espn_icon.jpeg")}
            style={{ width: 22, height: 22, borderRadius: 4 }}
          />
          <Text>Sync ESPN</Text>
        </View>
      </Button>
      <Button onPress={handleSyncYahoo} variant={compact ? "outline" : "secondary"}>
        <View className="flex-row items-center gap-2">
          <Image
            source={require("~/assets/league_sync/yahoo_icon.png")}
            style={{ width: 22, height: 22, borderRadius: 4 }}
          />
          <Text>Sync Yahoo</Text>
        </View>
      </Button>
    </View>
  );
}
