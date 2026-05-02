import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { supabase } from "~/utils/supabase";

// Single ledger row used to render the activity feed on Home. We project
// just the fields the UI needs so we can swap to a server-side view later
// without touching the consumer.
export interface ActivityRow {
  id: number;
  type: string;
  amountCents: number;
  createdAt: string;
  leagueId: string;
  leagueName: string;
}

interface DashboardSummary {
  // Sum of confirmed buy-ins (`type = 'buy_in_paid'`) the user has paid
  // across every league they're a member of. This is "your active money"
  // — the cash you've staked that's currently in escrow with PotKeeper.
  activeMoneyCents: number;
  // Most-recent ledger entries across all of the user's leagues. Limited
  // to 5 for the Home feed.
  activity: ActivityRow[];
  loading: boolean;
}

// Driving the Home dashboard hero + activity card. Refetches on focus so
// new buy-ins / payouts appear immediately when the user navigates back
// from the buy-in flow.
export function useDashboardSummary(): DashboardSummary {
  const [activeMoneyCents, setActiveMoneyCents] = useState(0);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        setLoading(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const profileId = sessionData.session?.user.id;
        if (!profileId) {
          if (!cancelled) {
            setActiveMoneyCents(0);
            setActivity([]);
            setLoading(false);
          }
          return;
        }

        // Pull every ledger row tied to the user's memberships. RLS on
        // pot_ledger restricts to leagues the caller belongs to, and the
        // !inner join filters to entries on this user's specific roster.
        // We keep this as a single round-trip rather than two queries so
        // the hero number and the activity feed stay consistent.
        const { data, error } = await supabase
          .from("pot_ledger")
          .select(
            "id, type, amount_cents, created_at, league_id, league_members!inner(linked_profile_id), leagues!inner(name)",
          )
          .eq("league_members.linked_profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (cancelled) return;
        if (error) {
          // Soft-fail: dashboard still renders with zero / empty feed.
          console.warn("useDashboardSummary load failed", error.message);
          setActiveMoneyCents(0);
          setActivity([]);
          setLoading(false);
          return;
        }

        const rows = (data ?? []) as Array<{
          id: number;
          type: string;
          amount_cents: number;
          created_at: string;
          league_id: string;
          leagues: { name: string };
        }>;

        const total = rows
          .filter((r) => r.type === "buy_in_paid")
          .reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);

        setActiveMoneyCents(total);
        setActivity(
          rows.slice(0, 5).map((r) => ({
            id: r.id,
            type: r.type,
            amountCents: r.amount_cents,
            createdAt: r.created_at,
            leagueId: r.league_id,
            leagueName: r.leagues?.name ?? "League",
          })),
        );
        setLoading(false);
      };

      load();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return { activeMoneyCents, activity, loading };
}

// Map a pot_ledger.type to a human label + icon for the activity feed.
// Centralized so we touch a single file when new ledger types land.
export function describeActivity(type: string): {
  label: string;
  icon: "dollar" | "trophy" | "star" | "minus" | "plus";
  tone: "positive" | "negative" | "neutral";
} {
  switch (type) {
    case "buy_in_paid":
      return { label: "Buy-in paid", icon: "dollar", tone: "neutral" };
    case "payout_winner":
      return { label: "Payout received", icon: "trophy", tone: "positive" };
    case "sponsorship_credit":
      return { label: "Sponsor boost added", icon: "star", tone: "positive" };
    case "stripe_fee":
      return { label: "Processing fee", icon: "minus", tone: "negative" };
    case "reserve_release":
      return { label: "Reserve released", icon: "plus", tone: "positive" };
    default:
      return { label: type.replace(/_/g, " "), icon: "dollar", tone: "neutral" };
  }
}
