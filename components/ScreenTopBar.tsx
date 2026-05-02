import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { Text } from "~/components/ui/text";
import { ThemeToggle } from "~/components/ThemeToggle";
import { useColorScheme } from "~/lib/useColorScheme";

// Shared in-screen top bar. We render this instead of the native Stack /
// Tabs header on most screens so the back button + theme toggle aren't
// wrapped in iOS 26's "Liquid Glass" capsules — those make the chrome look
// inconsistent with the rest of the app's flat dark UI. The Stack screens
// that use this should set `headerShown: false` in their layout.
//
// Consumers:
//   - app/(app)/league/[id]/index.tsx       (League detail)
//   - app/(app)/league/[id]/authorize.tsx   (Verify Final Standings)
//   - app/(app)/league/[id]/buy-in.tsx      (Set up the pot)
//   - app/(app)/league/[id]/buy-in-pay.tsx  (Pay your buy-in)
export function ScreenTopBar({
  title,
  showBack = true,
  rightAction,
}: {
  title: string;
  showBack?: boolean;
  // Optional override for the right slot. Defaults to <ThemeToggle />, which
  // is what every consumer wants today, but leaving a hook here for screens
  // that need a context action (e.g. refresh, edit).
  rightAction?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { isDarkColorScheme } = useColorScheme();
  return (
    <View
      className="px-5 pb-2 flex-row items-center justify-between bg-secondary/30"
      style={{ paddingTop: insets.top + 8 }}
    >
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={16}
          className="h-10 w-10 items-center justify-center"
          accessibilityLabel="Back"
        >
          <FontAwesome
            name="chevron-left"
            size={18}
            color={isDarkColorScheme ? "#FAFAFA" : "#0A0A0F"}
          />
        </Pressable>
      ) : (
        <View className="h-10 w-10" />
      )}
      <Text
        className="text-base font-semibold flex-1 text-center mx-2"
        numberOfLines={1}
      >
        {title}
      </Text>
      <View className="h-10 w-10 items-center justify-center">
        {rightAction ?? <ThemeToggle />}
      </View>
    </View>
  );
}
