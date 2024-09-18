import React from 'react';
import { useStorageState } from './useStorageState';
import { supabase } from '~/utils/supabase';

type AuthContextType = {
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
  session: any | null;
  user: any | null;
  isLoading: boolean;
};

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function useSession() {
  const value = React.useContext(AuthContext);
  if (!value) {
    throw new Error('useSession must be wrapped in a <SessionProvider />');
  }
  return value;
}

export function SessionProvider(props: React.PropsWithChildren) {
  const [[isSessionLoading, sessionString], setSession] = useStorageState('session');
  const [[isUserLoading, userString], setUser] = useStorageState('user');

  const [session, setSessionObj] = React.useState<any | null>(null);
  const [user, setUserObj] = React.useState<any | null>(null);

  React.useEffect(() => {
    if (sessionString) setSessionObj(JSON.parse(sessionString));
    if (userString) setUserObj(JSON.parse(userString));
  }, [sessionString, userString]);

  const isLoading = isSessionLoading || isUserLoading;

  const value: AuthContextType = {
    signIn: async (email: string, password: string) => {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error };
      setSession(JSON.stringify(data?.session));
      setUser(JSON.stringify(data?.user));
      return {};
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
    },
    session,
    user,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}