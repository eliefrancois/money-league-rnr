import { supabase } from "~/utils/supabase";
import { Session } from "@supabase/supabase-js";
import { Href, Redirect, Slot, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { SessionProvider } from "~/context";
import { Theme, ThemeProvider } from "@react-navigation/native";
import { NAV_THEME } from "~/lib/constants";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "~/lib/useColorScheme";

// Makes sure the user is authenticated before accessing protected pages
const InitialLayout = () => {
  const { isDarkColorScheme } = useColorScheme();

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

      if ((event === "SIGNED_IN" && session) || (event === "INITIAL_SESSION" && session)) {
        console.log("user signed in");
        router.replace("/(app)/");
      } else if ((event === "SIGNED_OUT" && !session) || (event === "INITIAL_SESSION" && !session)) {
        console.log("user signed out");
        router.replace("/(signIn)/" as unknown as Href<"/(signIn)/">);
      }

    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  /*
  useEffect(() => {
    if (!initialized) return;

    // Check if the path/url is in the (auth) group
    const inAuthGroup = segments[0] === "(app)";

    const loggedIn = session && !inAuthGroup;
    const loggedOut = !session;

    // logs to debug the flow of logging in 
    // BUG: When a user is logged in and goes to the login page, the user is not redirected to the home page
    console.log("loggedIn:", loggedIn);
    console.log("loggedOut:", loggedOut);
    console.log("app is in path", segments[0], "inAuthGroup is: ", segments[0] === "(app)");
    console.log("session", session);

    if (loggedIn) {
      // Redirect authenticated users to the list page
      console.log("redirecting to home page");
      router.replace("/(app)/");
    }
    // else if (loggedOut) {
    //   // Redirect unauthenticated users to the login page
    //   console.log("redirecting to login page");
    //   router.replace("/");
    // }
  }, [session, initialized]);
  */

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
