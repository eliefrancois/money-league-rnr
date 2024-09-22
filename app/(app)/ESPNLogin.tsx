import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import { StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ESPNLogin() {
    const webViewRef = useRef<WebView | null>(null);
    const router = useRouter();

    useFocusEffect(() => {
      const clearCookiesAndData = async () => {
          console.log("Clearing existing cookies and league data");
          await SecureStore.deleteItemAsync('espnCookies');
          await AsyncStorage.removeItem('leagueData');
          await AsyncStorage.removeItem('leagueDataUser');
          webViewRef.current?.clearCache?.(true);
      };

      clearCookiesAndData();
  });

    useEffect(() => {
      // Clear cookies when component mounts
      webViewRef.current?.clearCache?.(true);
  }, []);
    
    const handleNavigationStateChange = (navState: WebViewNavigation) => {
      if (navState.url === 'https://www.espn.com/') {
        // Login successful, capture cookies
        webViewRef.current?.injectJavaScript(`
             window.ReactNativeWebView.postMessage(document.cookie);
        `);
      }
    }

    const handleMessage = async (event: WebViewMessageEvent) => {
      const cookieString = event.nativeEvent.data;
      console.log("in handleMessage(), Cookie String", cookieString);
      const cookiePairs = cookieString.split('; ');
      const extractedCookies: { SWID?: string, espn_s2?: string } = {};

      cookiePairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key === 'SWID') {
          extractedCookies[key] = value;
        } else if (key === 'espn_s2') {
          // URL decode the espn_s2 cookie
          extractedCookies[key] = decodeURIComponent(value);
        }
      });

      // Store cookies securely
      await SecureStore.setItemAsync('espnCookies', JSON.stringify(extractedCookies));
      console.log("Cookies saved to secure store");

      // Navigate back to the previous screen
      router.back();
    }


    return (
        <WebView
          ref={webViewRef}
          style={styles.container}
          source={{ uri: 'https://espn.com/login' }}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          incognito={true}  // Use incognito mode
          thirdPartyCookiesEnabled={false}  // Disable third-party cookies
          sharedCookiesEnabled={false}  // Disable shared cookies
          cacheEnabled={false}  // Disable caching
        />
      );
    }
    
    const styles = StyleSheet.create({
      container: {
        flex: 1,
        // marginTop: Constants.statusBarHeight,
      },
    });