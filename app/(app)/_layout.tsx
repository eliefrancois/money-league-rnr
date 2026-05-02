import { Link, router, Tabs } from "expo-router";
import React from "react";
import { TabBarIcon } from "~/components/TabBarIcon";
import { ThemeToggle } from "~/components/ThemeToggle";
import { Colors } from "~/constants/Colors";
import { useColorScheme } from "~/lib/useColorScheme";
// Import your global CSS file
import "~/global.css";
import { Image, Pressable, View } from "react-native";
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
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerRight: () => (
          <View style={{ paddingRight: 12 }}>
            <ThemeToggle />
          </View>
        ),
        headerLeft: () => (
          <Link href="/settingsModal" asChild>
            <Pressable
              hitSlop={12}
              style={{
                width: 40,
                height: 40,
                marginLeft: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {({ pressed }) => (
                <FontAwesome
                  name="gear"
                  size={22}
                  color={Colors[isDarkColorScheme ? "dark" : "light"].text}
                  style={{ opacity: pressed ? 0.5 : 1 }}
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
          // Branded header on the home surface — text titles on subscreens.
          headerTitle: () => (
            <View className="flex-row items-center">
              <Image
                source={require("~/assets/images/potkeeper-mark.png")}
                style={{ width: 40, height: 40 }}
                resizeMode="contain"
              />
            </View>
          ),
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
        name="sleeper-link"
        options={{
          href: null,
          title: "Sync Sleeper",
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
      <Tabs.Screen
        name="league/[id]"
        options={{
          href: null,
          // The nested Stack at app/(app)/league/[id]/_layout.tsx provides
          // per-screen headers (League, Set up the pot, etc.). Hiding the
          // Tabs header here prevents a double header.
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          href: null,
          // Wallet renders its own top bar (back chevron + refresh) so it
          // can lay out the page without the tab header in the way.
          headerShown: false,
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
