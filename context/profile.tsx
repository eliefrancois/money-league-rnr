import * as React from "react";
import type { Tables } from "~/lib/database.types";
import { supabase } from "~/utils/supabase";
import { useSession } from "~/context";

// =============================================================================
// ProfileProvider — derived profile state for the signed-in user.
// =============================================================================
//
// Sits below SessionProvider in the tree; refetches `profiles` whenever the
// session changes. The most common consumer is RoutingGate (gates routes on
// `geo_status`) but downstream screens that need username/avatar/eligibility
// state can read here too.
//
// Refetch is exposed so flows that mutate the profile (eligibility submit,
// Stripe Connect KYC, etc.) can trigger a reload without waiting for a route
// change to remount.

type Profile = Tables<"profiles">;

type ProfileContextType = {
  profile: Profile | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

const ProfileContext = React.createContext<ProfileContextType | undefined>(
  undefined,
);

export function useProfile(): ProfileContextType {
  const value = React.useContext(ProfileContext);
  if (!value) {
    throw new Error("useProfile must be used inside a <ProfileProvider />");
  }
  return value;
}

export function ProfileProvider({ children }: React.PropsWithChildren) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  const fetchProfile = React.useCallback(async (id: string | null) => {
    if (!id) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();
    if (error) {
      console.error("[ProfileProvider] fetch failed", error.message);
      setProfile(null);
    } else {
      setProfile(data);
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    fetchProfile(userId);
  }, [userId, fetchProfile]);

  // Stabilize `refetch` separately from the value memo. If we inline
  // `() => fetchProfile(userId)` inside the useMemo whose deps include
  // `profile`/`isLoading`, every successful fetch creates a new `refetch`
  // identity, which then invalidates downstream `useCallback`s that
  // depend on it (e.g. wallet screen's `refreshStatus`), which then
  // re-fires their `useFocusEffect`, which calls refresh again → tight
  // refetch loop. Keeping refetch's identity tied to userId only breaks
  // that loop.
  const refetch = React.useCallback(
    () => fetchProfile(userId),
    [fetchProfile, userId],
  );

  const value = React.useMemo<ProfileContextType>(
    () => ({ profile, isLoading, refetch }),
    [profile, isLoading, refetch],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}
