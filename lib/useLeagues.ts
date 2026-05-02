import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { supabase } from "~/utils/supabase";
import type { Tables } from "~/lib/database.types";

export type League = Tables<"leagues">;
export type LeagueMember = Tables<"league_members">;

// A league row + my membership in it (we only fetch my own member row, never others).
export interface LeagueWithMembership {
  league: League;
  my: Pick<LeagueMember, "roster_id" | "is_owner" | "linked_profile_id">;
}

interface UseLeaguesResult {
  leagues: LeagueWithMembership[] | null;
  error: string | null;
}

// Shared loader used by Home and Leagues tabs. Refetches when the screen
// regains focus so newly-imported leagues show up immediately.
export function useLeagues(): UseLeaguesResult {
  const [leagues, setLeagues] = useState<LeagueWithMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const profileId = sessionData.session?.user.id;
        if (!profileId) {
          if (!cancelled) setLeagues([]);
          return;
        }

        // Filtered embed: pull leagues where THIS user has a league_members row.
        // !inner makes it an inner join so we never get leagues without membership.
        const { data, error } = await supabase
          .from("leagues")
          .select(
            "*, league_members!inner(roster_id, is_owner, linked_profile_id)",
          )
          .eq("league_members.linked_profile_id", profileId)
          .order("season", { ascending: false })
          .order("created_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          setError(error.message);
          setLeagues([]);
          return;
        }

        const rows: LeagueWithMembership[] = (data ?? []).map((row) => {
          const { league_members, ...league } = row as League & {
            league_members: LeagueMember[];
          };
          return {
            league: league as League,
            my: league_members[0] ?? {
              roster_id: null,
              is_owner: false,
              linked_profile_id: null,
            },
          };
        });
        setLeagues(rows);
      };

      load();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return { leagues, error };
}

export function formatLeagueStatus(status: string | null): string | null {
  if (!status) return null;
  if (status === "complete") return "Season complete";
  if (status === "in_season") return "In season";
  if (status === "drafting") return "Drafting";
  if (status === "pre_draft") return "Pre-draft";
  return status.replace(/_/g, " ");
}
