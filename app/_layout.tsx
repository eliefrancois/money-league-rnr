import { supabase } from "~/utils/supabase";
import { Session } from "@supabase/supabase-js";
import { Redirect, Slot, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { SessionProvider } from "~/context";
import { Theme, ThemeProvider } from "@react-navigation/native";
import { NAV_THEME } from "~/lib/constants";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "~/lib/useColorScheme";

// Makes sure the user is authenticated before accessing protected pages
const InitialLayout = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);
  const { isDarkColorScheme } = useColorScheme();

  const segments = useSegments();
  const router = useRouter();

  const LIGHT_THEME: Theme = {
    dark: false,
    colors: NAV_THEME.light,
  };
  const DARK_THEME: Theme = {
    dark: true,
    colors: NAV_THEME.dark,
  };

  useEffect(() => {
    // Listen for changes to authentication state
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("supabase.auth.onAuthStateChange", event, session);

      setSession(session);
      setInitialized(true);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!initialized) return;

    // Check if the path/url is in the (auth) group
    const inAuthGroup = segments[0] === "(app)";

    const loggedIn = session && !inAuthGroup;
    const loggedOut = !session;

    //logs to debug the flow of logging in 
    // BUG:When a user is logged in and goes to the login page, the user is not redirected to the home page
    console.log("loggedIn:", loggedIn);
    console.log("loggedOut:", loggedOut);
    console.log("app is in path", segments[0], "inAuthGroup is: ", segments[0] === "(app)");
    console.log("session", session);

    if (loggedIn) {
      // Redirect authenticated users to the list page
      router.replace("/(app)/");
    } else if (loggedOut) {
      // Redirect unauthenticated users to the login page
      router.replace("/");
    }
  }, [session, initialized]);

  return (
    <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
      <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
      <SessionProvider>
        <Slot />
      </SessionProvider>
    </ThemeProvider>
  );
};

export default InitialLayout;
