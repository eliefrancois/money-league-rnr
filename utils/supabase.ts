import { AppState } from 'react-native'
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl =  process.env.EXPO_PUBLIC_DATABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_DATABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Tells Supabase Auth to continuously refresh the session automatically
// if the app is in the foreground. When this is added, you will continue
// to receive `onAuthStateChange` events with the `TOKEN_REFRESHED` or
// `SIGNED_OUT` event if the user's session is terminated. This should
// only be registered once.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})

/**
 * Retrieves the current user's information.
 * 
 * Use cases:
 * - Checking if a user is logged in
 * - Displaying user information in the app
 * 
 * Example usage:
 * const user = await getUser();
 * if (user) {
 *   console.log('Current user:', user);
 * } else {
 *   console.log('No user logged in');
 * }
 */
export const getUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  return data;
}
/**
 * Retrieves the current session information.
 * 
 * Use cases:
 * - Checking if a user's session is valid
 * - Retrieving session tokens for API calls
 * 
 * Example usage:
 * const session = await getSession();
 * if (session) {
 *   console.log('Active session:', session);
 * } else {
 *   console.log('No active session');
 * }
 */
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  return data;
}
/**
 * Signs up a new user with email and password.
 * 
 * Use cases:
 * - User registration functionality
 * 
 * Example usage:
 * const { data, error } = await signUp('newuser@example.com', 'newpassword123');
 * if (error) {
 *   console.error('Sign up error:', error);
 * } else {
 *   console.log('User signed up:', data.user);
 * }
 */
export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { data, error };
}
/**
 * Initiates the password reset process for a given email.
 * 
 * Use cases:
 * - Forgot password functionality
 * 
 * Example usage:
 * const { data, error } = await resetPassword('user@example.com');
 * if (error) {
 *   console.error('Reset password error:', error);
 * } else {
 *   console.log('Password reset email sent');
 * }
 */
export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);
  return { data, error };
}
/**
 * Updates the password for the current user.
 * 
 * Use cases:
 * - Allowing users to change their password
 * 
 * Example usage:
 * const { data, error } = await updatePassword('newSecurePassword123');
 * if (error) {
 *   console.error('Password update error:', error);
 * } else {
 *   console.log('Password updated successfully');
 * }
 */
export const updatePassword = async (newPassword: string) => {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  return { data, error };
}
/**
 * Updates user attributes for the current user.
 * 
 * Use cases:
 * - Updating user email, phone, or other auth-related attributes
 * 
 * Example usage:
 * const { data, error } = await updateUser({ email: 'newemail@example.com' });
 * if (error) {
 *   console.error('User update error:', error);
 * } else {
 *   console.log('User updated:', data.user);
 * }
 */
export const updateUser = async (attributes: { [key: string]: any }) => {
  const { data, error } = await supabase.auth.updateUser(attributes);
  return { data, error };
}
/**
 * Retrieves a user's profile from the 'profiles' table.
 * 
 * Use cases:
 * - Fetching user profile information for display
 * - Retrieving user-specific data
 * 
 * Example usage:
 * const { data, error } = await getProfile('user123');
 * if (error) {
 *   console.error('Error fetching profile:', error);
 * } else {
 *   console.log('User profile:', data);
 * }
 */
export const getProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}
/**
 * Updates a user's profile in the 'profiles' table.
 * 
 * Use cases:
 * - Updating user information after registration
 * - Allowing users to edit their profile details
 * - Updating user preferences or settings
 * 
 * Example usage:
 * const userId = 'user123';
 * const updates = { name: 'John Doe', age: 30, bio: 'Software developer' };
 * const { data, error } = await updateProfile(userId, updates);
 * if (error) {
 *   console.error('Error updating profile:', error);
 * } else {
 *   console.log('Profile updated successfully:', data);
 * }
 */
export const updateProfile = async (userId: string, updates: { [key: string]: any }) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  return { data, error };
}
/**
 * Sets up a listener for authentication state changes.
 * 
 * Use cases:
 * - Responding to user sign-in or sign-out events
 * - Updating UI based on authentication state
 * 
 * Example usage:
 * const { data: authListener } = onAuthStateChange((event, session) => {
 *   if (event === 'SIGNED_IN') {
 *     console.log('User signed in:', session.user);
 *   } else if (event === 'SIGNED_OUT') {
 *     console.log('User signed out');
 *   }
 * });
 * 
 * // Remember to unsubscribe when no longer needed:
 * // authListener.unsubscribe();
 */
export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  return supabase.auth.onAuthStateChange(callback);
}


  
