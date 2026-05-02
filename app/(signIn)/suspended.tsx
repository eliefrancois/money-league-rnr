import { View } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSession } from "~/context";

// Catch-all suspended screen. Shown when geo_status='suspended' but the
// user isn't on the more specific underage / restricted flows (e.g.
// suspended later by Checkpoint 2/3 webhook reconciliation, or stale
// session from a previously-blocked attempt). We don't yet know the reason
// here, so we point them to support.

export default function SuspendedScreen() {
  const { signOut } = useSession();

  return (
    <View className="flex-1 bg-background pt-14">
      <View className="flex-1 items-center justify-center px-8 gap-3">
        <View
          className="h-24 w-24 rounded-3xl items-center justify-center mb-4"
          style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
        >
          <FontAwesome name="lock" size={36} color="#EF4444" />
        </View>
        <Text className="text-3xl font-bold tracking-tight text-center">
          Account on hold
        </Text>
        <Text className="text-center text-muted-foreground leading-5 max-w-xs">
          Your PotKeeper account is currently suspended. If you think this is
          a mistake, contact support@potkeeper.app and we'll take a look.
        </Text>
      </View>
      <View className="px-6 pb-10">
        <Button onPress={() => signOut()} variant="outline" className="w-full">
          <Text>Sign out</Text>
        </Button>
      </View>
    </View>
  );
}
