import { Stack, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

import { Colors } from "~/constants/Colors";
import { ThemeToggle } from "~/components/ThemeToggle";
import { useColorScheme } from "~/lib/useColorScheme";

// Per-league nested Stack so we can have multiple screens under /league/[id]
// (detail, buy-in setup, future invite/payout screens) without crowding the
// parent Tabs config. The parent Tabs hides its own header for this subtree
// (see app/(app)/_layout.tsx); each Stack.Screen below provides its own.
export default function LeagueIdLayout() {
  const router = useRouter();
  const { isDarkColorScheme } = useColorScheme();
  const textColor = Colors[isDarkColorScheme ? "dark" : "light"].text;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleStyle: { fontWeight: "bold" },
        headerLeft: () => (
          <Pressable onPress={() => router.back()}>
            {({ pressed }) => (
              <FontAwesome
                name="chevron-left"
                size={25}
                color={textColor}
                style={{ marginLeft: 15, opacity: pressed ? 0.5 : 1 }}
              />
            )}
          </Pressable>
        ),
        headerRight: () => <ThemeToggle />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          // Index screen renders its own in-screen top bar (back chevron +
          // league name + theme toggle) to match the rest of the app's
          // visual language. Hiding the native header avoids the iOS 26
          // Liquid Glass capsules around the back button / right action.
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="buy-in"
        options={{
          // Custom in-screen ScreenTopBar — see comment on `index` above
          // for why we skip the native iOS 26 Liquid Glass header.
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="buy-in-pay"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="receipt"
        options={{ title: "Receipt", headerLeft: () => null, gestureEnabled: false }}
      />
      <Stack.Screen
        name="authorize"
        options={{
          // Same reason as `index`: render a custom in-screen top bar so we
          // skip the iOS 26 Liquid Glass capsules around header buttons.
          headerShown: false,
        }}
      />
    </Stack>
  );
}
