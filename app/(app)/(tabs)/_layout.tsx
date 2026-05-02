import React from "react";
import { Tabs } from "expo-router";

import { TabBarIcon } from "~/components/TabBarIcon";
import { Colors } from "~/constants/Colors";
import { useColorScheme } from "~/lib/useColorScheme";

// Sprint 5 IA: 4-tab bottom nav (Home / Leagues / Browse / Profile).
// Each tab renders its own header via ScreenTopBar so we can match the
// prototype's per-screen visual language. The native Tabs header is
// disabled here. Non-tab screens (sleeper-link, wallet, league/[id])
// live as siblings of this group on the parent (app) Stack.
export default function TabsLayout() {
  const { isDarkColorScheme } = useColorScheme();
  const tint = Colors[isDarkColorScheme ? "dark" : "light"].tint;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? "home" : "home-outline"} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: "Leagues",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? "layers" : "layers-outline"} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? "compass" : "compass-outline"} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? "person" : "person-outline"} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
