import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import type { AuthError, Session, User } from "@supabase/supabase-js";

import { supabase } from "~/utils/supabase";

// =============================================================================
// SessionProvider — single source of truth for auth state.
// =============================================================================
//
// Subscribes to supabase.auth.onAuthStateChange so every login, logout, token
// refresh, and user-update from anywhere in the app flows back through this
// provider's state. Initial state comes from supabase.auth.getSession() which
// reads from the storage adapter we configured in utils/supabase.ts.
//
// While the initial session is being read from storage we render a spinner
// instead of children — this prevents the hydration race that previously had
// callers reading useSession().user as null on cold start. Consumers of
// useSession() can therefore trust that user/session reflect Supabase's
// actual current state at all times.
//
// API contract:
//   const { session, user, signIn, signUp, signOut, isLoading } = useSession();
// `isLoading` is false by the time children render (we block above), but kept
// in the type for forward compat (e.g. moving the provider higher in the tree
// later, or exposing a loading flag for inline UI states).

type SignResult = { error?: AuthError };

type AuthContextType = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<SignResult>;
  signUp: (email: string, password: string) => Promise<SignResult>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function useSession(): AuthContextType {
  const value = React.useContext(AuthContext);
  if (!value) {
    throw new Error("useSession must be used inside a <SessionProvider />");
  }
  return value;
}

export function SessionProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    // Hydrate from storage. Supabase's SDK reads our async storage adapter
    // and resolves with whatever session was last persisted (or null).
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setIsLoading(false);
    });

    // Listen for every subsequent change. Events we care about:
    //   INITIAL_SESSION  — emitted alongside the getSession() above; idempotent
    //   SIGNED_IN        — after signIn / signUp completes
    //   SIGNED_OUT       — after signOut, or when refresh token is rejected
    //   TOKEN_REFRESHED  — every ~hour, keeps in-memory state fresh
    //   USER_UPDATED     — when user metadata or email changes
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        setIsLoading(false);
      },
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = React.useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        // We don't manually setSession here — onAuthStateChange will fire.
        return error ? { error } : {};
      },
      signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { error };
        // Supabase returns a "user-shaped" object with empty `identities`
        // when an account with this email already exists (an anti-email-
        // enumeration measure). Without this check the UI silently does
        // nothing on retry. Surface a real message instead.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          return {
            error: {
              name: "AuthApiError",
              message:
                "An account with this email already exists. Try signing in instead.",
              status: 409,
            } as unknown as AuthError,
          };
        }
        return {};
      },
      signOut: async () => {
        await supabase.auth.signOut();
        // onAuthStateChange fires SIGNED_OUT and clears local state.
      },
    }),
    [session, isLoading],
  );

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        accessibilityLabel="Loading session"
      >
        <ActivityIndicator />
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
