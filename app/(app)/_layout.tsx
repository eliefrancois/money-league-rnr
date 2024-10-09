import { Link, router, Tabs } from "expo-router";
import React from "react";
import { TabBarIcon } from "~/components/TabBarIcon";
import { ThemeToggle } from "~/components/ThemeToggle";
import { Colors } from "~/constants/Colors";
import { useColorScheme } from "~/lib/useColorScheme";
// Import your global CSS file
import "~/global.css";
import { Pressable } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

export default function TabLayout() {
  const { isDarkColorScheme } = useColorScheme();
  console.log(
    "Active tint color:",
    Colors[isDarkColorScheme ? "dark" : "light"].tint
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:
          Colors[isDarkColorScheme ? "dark" : "light"].tint,
        headerShown: true,
        headerRight: () => <ThemeToggle />,
        headerLeft: () => (
          <Link href="/settingsModal" asChild>
            <Pressable>
              {({ pressed }) => (
                <FontAwesome
                  name="gear"
                  size={25}
                  color={Colors[isDarkColorScheme ? "dark" : "light"].text}
                  style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                />
              )}
            </Pressable>
          </Link>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? "home" : "home-outline"}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? "code-slash" : "code-slash-outline"}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settingsModal"
        options={{
          href: null,
          title: "Settings",
          headerShown: true,
          headerLeft: () => (
            <Pressable onPress={() => router.back()}>
              {({ pressed }) => (
                <FontAwesome
                  name="chevron-left"
                  size={25}
                  color={Colors[isDarkColorScheme ? "dark" : "light"].text}
                  style={{ marginLeft: 15, opacity: pressed ? 0.5 : 1 }}
                />
              )}
            </Pressable>
          ),
          headerRight: () => null,
        }}
      />
      <Tabs.Screen
        name="ESPNLogin"
        options={{
          href: null,
          title: "ESPN Login",
          headerShown: true,
          headerLeft: () => null,
          headerRight: () => null,
        }}
      />
      <Tabs.Screen
        name="league/[leagueId]"
        options={{
          href: null,
          title: "View League",
          headerShown: true,
          headerLeft: () => (
            <Pressable onPress={() => router.replace("/ESPNLeagues")}>
              {({ pressed }) => (
                <FontAwesome
                  name="chevron-left"
                  size={25}
                  color={Colors[isDarkColorScheme ? "dark" : "light"].text}
                  style={{ marginLeft: 15, opacity: pressed ? 0.5 : 1 }}
                />
              )}
            </Pressable>
          ),
          headerRight: () => <ThemeToggle />,
        }}
      />
      <Tabs.Screen
        name="ESPNLeagues"
        options={{
          href: null,
          title: "ESPN Leagues",
          headerShown: true,
          headerLeft: () => (
            <Pressable onPress={() => router.back()}>
              {({ pressed }) => (
                <FontAwesome
                  name="chevron-left"
                  size={25}
                  color={Colors[isDarkColorScheme ? "dark" : "light"].text}
                  style={{ marginLeft: 15, opacity: pressed ? 0.5 : 1 }}
                />
              )}
            </Pressable>
          ),
          headerRight: () => <ThemeToggle />,
        }}
      />
      {/* <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'settings' : 'settings-outline'} color={color} />
          ),
        }}
      /> */}
    </Tabs>
  );
}
