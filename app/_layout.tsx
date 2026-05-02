import { Slot, useRouter, useSegments } from "expo-router";
import { Theme, ThemeProvider } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as React from "react";

import { SessionProvider, useSession } from "~/context";
import { ProfileProvider, useProfile } from "~/context/profile";
import { NAV_THEME } from "~/lib/constants";
import { useColorScheme } from "~/lib/useColorScheme";

const LIGHT_THEME: Theme = {
  dark: false,
  colors: NAV_THEME.light,
  fonts: NAV_THEME.light.fonts,
};

const DARK_THEME: Theme = {
  dark: true,
  colors: NAV_THEME.dark,
  fonts: NAV_THEME.dark.fonts,
};

// Eligibility-flow screens that should NOT be redirected away even though
// the profile is in a non-app state (pending / suspended). Tested against
// `segments[1]` — i.e. the route name inside the (signIn) group.
const ELIGIBILITY_FLOW_ROUTES = new Set([
  "eligibility",
  "underage",
  "restricted",
  "suspended",
]);

// Reactive routing gate: keeps the user in the correct route group based on
// session + profile eligibility state (Checkpoint 1).
//
// State machine:
//   no session                              → /(signIn)/
//   session + geo='pending'                 → /(signIn)/eligibility
//   session + geo='suspended'               → /(signIn)/suspended
//                                             (unless already on
//                                             underage / restricted /
//                                             eligibility — in which case
//                                             stay there)
//   session + geo='declared' | 'verified'   → /(app)/
function RoutingGate({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { profile, isLoading: profileLoading } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    const inAppGroup = segments[0] === "(app)";
    const inSignInGroup = segments[0] === "(signIn)";
    const eligibilityRoute = segments[1] ?? "";

    if (!session) {
      // No session: kick back to the welcome screen from the (app) group OR
      // from any deep eligibility-flow screen the user might have been on
      // when they signed out.
      const onSignInIndex = inSignInGroup && (segments[1] ?? "") === "";
      if (inAppGroup || (inSignInGroup && !onSignInIndex)) {
        router.replace("/(signIn)/");
      }
      return;
    }

    // Wait for the profile fetch to land before making routing decisions —
    // otherwise we briefly bounce signed-in users back to /(signIn) on
    // cold start.
    if (profileLoading || !profile) return;

    const geo = profile.geo_status;

    if (geo === "pending") {
      // Allow the user to stay on any eligibility-flow screen. Covers two
      // cases: (1) normal flow — they're on /eligibility filling out the
      // form, and (2) just-submitted-and-failed — eligibility-fail-cleanup
      // has deleted their auth user but the local profile cache is stale-
      // pending while we navigate to /underage or /restricted.
      if (!ELIGIBILITY_FLOW_ROUTES.has(eligibilityRoute)) {
        router.replace("/(signIn)/eligibility");
      }
      return;
    }

    if (geo === "suspended") {
      // Allow the user to stay on any eligibility-flow screen that's
      // already informing them they're blocked. Catches stragglers from
      // the (app) group or a stale signed-in session.
      if (
        inAppGroup ||
        (inSignInGroup && !ELIGIBILITY_FLOW_ROUTES.has(eligibilityRoute))
      ) {
        router.replace("/(signIn)/suspended");
      }
      return;
    }

    // declared or verified → into the app
    if (inSignInGroup) {
      router.replace("/(app)/");
    }
  }, [session, segments, router, profile, profileLoading]);

  return <>{children}</>;
}

export default function RootLayout() {
  const { isDarkColorScheme } = useColorScheme();

  return (
    <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
      <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
      <SessionProvider>
        <ProfileProvider>
          <RoutingGate>
            <Slot />
          </RoutingGate>
        </ProfileProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
