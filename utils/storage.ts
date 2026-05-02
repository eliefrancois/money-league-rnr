import { Platform } from 'react-native';

// Web-compatible storage that falls back to localStorage on web
class WebCompatibleStorage {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } else {
      // Use AsyncStorage for native platforms
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      return await AsyncStorage.getItem(key);
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } else {
      // Use AsyncStorage for native platforms
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(key, value);
    }
  }

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } else {
      // Use AsyncStorage for native platforms
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem(key);
    }
  }
}

export const storage = new WebCompatibleStorage();

