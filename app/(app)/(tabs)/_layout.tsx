import { Tabs } from 'expo-router';
import React from 'react';
import { TabBarIcon } from '~/components/TabBarIcon';
import { ThemeToggle } from '~/components/ThemeToggle';
import { Colors } from '~/constants/Colors';
import { useColorScheme } from '~/lib/useColorScheme';


export default function TabLayout() {
  const { isDarkColorScheme } = useColorScheme();
  console.log('Active tint color:', Colors[isDarkColorScheme ? 'dark' : 'light'].tint);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[isDarkColorScheme ? 'dark' : 'light'].tint,
        headerShown: true,
        headerRight: () => <ThemeToggle />
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'home' : 'home-outline'} color={color} />
          ),
        }}
      />
      {/* <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'code-slash' : 'code-slash-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'person' : 'person-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
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
