import { Stack } from "expo-router";

// Hides the default navigation header — every (signIn) screen renders its
// own top bar to match the onboarding prototype. The RoutingGate in
// app/_layout.tsx is responsible for sending the user to the right screen
// based on session + profile.geo_status.

export default function SignInLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="eligibility" />
      <Stack.Screen name="underage" />
      <Stack.Screen name="restricted" />
      <Stack.Screen name="suspended" />
    </Stack>
  );
}
