import {
  WebView,
  WebViewMessageEvent,
  WebViewNavigation,
} from "react-native-webview";
import { StyleSheet } from "react-native";
import { useEffect, useRef } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { updateProfile } from "~/utils/supabase";
import { useSession } from "~/context";

export default function ESPNLogin() {
  const webViewRef = useRef<WebView | null>(null);
  const router = useRouter();
  const { user } = useSession();

  useFocusEffect(() => {
    const clearCookiesAndData = async () => {
      console.log("Clearing existing cookies and league data");
      await SecureStore.deleteItemAsync("espnCookies");
      await AsyncStorage.removeItem("leagueData");
      await AsyncStorage.removeItem("leagueDataUser");
      webViewRef.current?.clearCache?.(true);
    };

    clearCookiesAndData();
  });

  useEffect(() => {
    // Clear cookies when component mounts
    webViewRef.current?.clearCache?.(true);
  }, []);

  // This method updates the user's profile to indicate that ESPN is synced
  const updateUserProfile = async () => {
    try {
      const espn_s2Cookie = await SecureStore.getItemAsync("espn_s2");
      const SWIDCookie = await SecureStore.getItemAsync("espn_swid");
      const updates = { is_espn_synced: true, espn_s2: espn_s2Cookie, espn_swid: SWIDCookie };
      await updateProfile(user.id, updates);
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  }

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    if (navState.url === "https://www.espn.com/") {
      // Login successful, capture cookies
      webViewRef.current?.injectJavaScript(`
             window.ReactNativeWebView.postMessage(document.cookie);
        `);
    }
  };

  const handleMessage = async (event: WebViewMessageEvent) => {
    const cookieString = event.nativeEvent.data;
    // console.log("in handleMessage(), Cookie String", cookieString);
    const cookiePairs = cookieString.split("; ");
    const extractedCookies: { SWID?: string; espn_s2?: string } = {};

    cookiePairs.forEach((pair) => {
      const [key, value] = pair.split("=");
      if (key === "SWID") {
        extractedCookies[key] = value;
      } else if (key === "espn_s2") {
        // URL decode the espn_s2 cookie
        extractedCookies[key] = decodeURIComponent(value);
      }
    });

    // Store cookies securely
    await SecureStore.setItemAsync(
      "espnCookies",
      JSON.stringify(extractedCookies)
    );
    console.log("Cookies saved to secure store");
    console.log("Cookies ESPNLogin", extractedCookies);

    await updateUserProfile().then(() => {
      console.log("User profile updated successfully");
    })

    // Navigate back to the previous screen
    router.replace("/");
  };

  return (
    <WebView
      ref={webViewRef}
      style={styles.container}
      source={{ uri: "https://espn.com/login" }}
      onNavigationStateChange={handleNavigationStateChange}
      onMessage={handleMessage}
      incognito={true} // Use incognito mode
      thirdPartyCookiesEnabled={false} // Disable third-party cookies
      sharedCookiesEnabled={false} // Disable shared cookies
      cacheEnabled={false} // Disable caching
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // marginTop: Constants.statusBarHeight,
  },
});
