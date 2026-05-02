import React from "react";
import { Stack } from "expo-router";

import "~/global.css";

// (app) Stack — hosts the 4-tab nav as a child group plus all non-tab
// destinations (sleeper-link, wallet, ESPNLogin, league/[id]). Each
// nested screen renders its own header (via ScreenTopBar or its own
// nested Stack), so the parent Stack runs headerShown: false.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sleeper-link" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="ESPNLogin" />
      <Stack.Screen name="league/[id]" />
    </Stack>
  );
}
