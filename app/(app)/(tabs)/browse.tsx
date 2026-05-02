import { View } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "~/components/ui/text";
import { ThemeToggle } from "~/components/ThemeToggle";

// Browse tab — Phase 2 surface for bar partner leagues + public discovery.
// We ship this as a tab today (rather than hide it) so the IA stays
// consistent with the prototype and users start seeing the path
// PotKeeper is heading toward. Real content comes after launch once we
// have bar partners + public-listing tooling.
export default function BrowseTab() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-secondary/30">
      <View
        className="px-5 pb-2 flex-row items-center justify-between"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Text className="text-2xl font-extrabold tracking-tight">Browse</Text>
        <ThemeToggle />
      </View>

      <View className="flex-1 items-center justify-center px-8 gap-3">
        <View className="h-14 w-14 rounded-2xl bg-amber-500/15 items-center justify-center">
          <FontAwesome name="beer" size={26} color="#F59E0B" />
        </View>
        <Text className="text-lg font-bold text-center">
          Bar leagues are coming
        </Text>
        <Text className="text-sm text-muted-foreground text-center max-w-xs">
          Find money pots running at your local bar — buy-in, get bar credit,
          watch games together. We're onboarding the first partners now.
        </Text>
      </View>
    </View>
  );
}
