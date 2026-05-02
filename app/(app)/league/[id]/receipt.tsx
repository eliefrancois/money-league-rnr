import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSession } from "~/context";
import type { Tables } from "~/lib/database.types";
import { supabase } from "~/utils/supabase";

// Receipt screen (APP_FLOW.md Flow 5, Screen 5.3).
//
// Two states the user can land here in:
//   1. Webhook already fired before they got back  → render success immediately
//   2. Webhook hasn't landed yet (race with browser dismiss)
//      → poll league_member.payment_status every 2s, up to ~30s
//
// In rare cases the user cancelled the Checkout session entirely; we
// detect that by polling timing out and surface a "didn't go through —
// try again" state instead of pretending success.

type League = Tables<"leagues">;
type LeagueMember = Tables<"league_members">;

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30_000;

export default function ReceiptScreen() {
  const { id, session_id } = useLocalSearchParams<{
    id: string;
    session_id?: string;
  }>();
  const { user } = useSession();

  const [league, setLeague] = useState<League | null>(null);
  const [member, setMember] = useState<LeagueMember | null>(null);
  const [status, setStatus] = useState<"loading" | "paid" | "pending" | "failed">(
    "loading",
  );
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!id || !user?.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const [leagueRes, memberRes] = await Promise.all([
        supabase.from("leagues").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("league_members")
          .select("*")
          .eq("league_id", id)
          .eq("linked_profile_id", user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (leagueRes.data) setLeague(leagueRes.data);
      if (memberRes.data) setMember(memberRes.data);

      if (memberRes.data?.payment_status === "paid") {
        setStatus("paid");
        return;
      }

      const elapsed = Date.now() - startedAtRef.current;
      if (elapsed >= POLL_TIMEOUT_MS) {
        // Webhook never confirmed in our window. Could be a slow
        // Stripe→our backend hop, an actually-cancelled session, or a
        // payment-method failure. Surface the ambiguous state with a
        // retry path instead of guessing.
        setStatus("failed");
        return;
      }

      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, user?.id]);

  if (status === "loading" || (status !== "paid" && !league)) {
    return (
      <View className="flex-1 items-center justify-center bg-secondary/30 gap-3">
        <ActivityIndicator />
        <Text className="text-xs text-muted-foreground">
          Confirming your payment…
        </Text>
      </View>
    );
  }

  if (status === "failed") {
    return (
      <View className="flex-1 items-center justify-center gap-4 p-6 bg-secondary/30">
        <View className="h-20 w-20 rounded-3xl bg-amber-500/15 items-center justify-center">
          <FontAwesome name="exclamation-circle" size={36} color="#f59e0b" />
        </View>
        <View className="items-center gap-1">
          <Text className="text-2xl font-extrabold tracking-tight text-center">
            We couldn't confirm your payment
          </Text>
          <Text className="text-xs text-muted-foreground text-center max-w-xs">
            Either the payment didn't go through or our system hasn't heard
            back from Stripe yet. If you saw a success page, give it a
            minute and refresh — otherwise tap below to try again.
          </Text>
        </View>
        <View className="gap-2 w-full max-w-sm">
          <Button
            onPress={() =>
              router.replace({
                pathname: "/league/[id]/buy-in-pay",
                params: { id: id! },
              })
            }
          >
            <Text className="font-bold">Try again</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={() =>
              router.replace({
                pathname: "/league/[id]",
                params: { id: id! },
              })
            }
          >
            <Text>Back to league</Text>
          </Button>
        </View>
      </View>
    );
  }

  // status === 'paid'
  const buyIn = league?.buy_in_cents ?? 0;
  const paidAt = member?.updated_at ?? new Date().toISOString();

  return (
    <View className="flex-1 bg-secondary/30">
      <ScrollView contentContainerClassName="p-5 gap-4 pb-24">
        {/* Hero */}
        <View className="items-center pt-6 pb-2">
          <View className="h-24 w-24 rounded-3xl bg-green-500 items-center justify-center mb-4">
            <FontAwesome name="check" size={42} color="#ffffff" />
          </View>
          <Text className="text-3xl font-black tracking-tight">You're in</Text>
          <Text className="text-sm text-muted-foreground mt-1.5 max-w-xs text-center">
            Your buy-in is held in PotKeeper's Stripe escrow until season end.
          </Text>
        </View>

        {/* Receipt card */}
        <View className="rounded-2xl border border-border bg-card p-5 gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Amount paid
            </Text>
            <Text className="text-lg font-extrabold tabular-nums">
              {formatCents(buyIn)}
            </Text>
          </View>
          <View className="border-t border-border" />
          <ReceiptRow label="League" value={league?.name ?? "—"} />
          <ReceiptRow label="Season" value={league?.season ?? "—"} />
          <ReceiptRow
            label="Date"
            value={new Date(paidAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          />
          {session_id ? (
            <ReceiptRow
              label="Confirmation"
              value={session_id.slice(0, 18) + "…"}
              monospace
            />
          ) : null}
        </View>

        {/* Trust strip */}
        <View className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 flex-row items-center gap-3">
          <View className="h-8 w-8 rounded-lg bg-green-500/20 items-center justify-center">
            <FontAwesome name="shield" size={13} color="#22c55e" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-semibold">In escrow</Text>
            <Text className="text-[11px] text-muted-foreground mt-0.5">
              Locked in Stripe's escrow until standings finalize.
              Auto-distributed to winners.
            </Text>
          </View>
        </View>

        <Text className="text-[11px] text-muted-foreground text-center mt-1">
          A receipt has been emailed to you.
        </Text>
      </ScrollView>

      {/* Sticky CTAs */}
      <View className="absolute left-0 right-0 bottom-0 px-5 pb-8 pt-3 bg-secondary/95 border-t border-border gap-2">
        <Button
          onPress={() =>
            router.replace({
              pathname: "/league/[id]",
              params: { id: id! },
            })
          }
        >
          <Text className="font-bold">Go to league</Text>
        </Button>
        <Button
          variant="ghost"
          onPress={() => router.replace("/(app)/wallet")}
        >
          <View className="flex-row items-center gap-2">
            <FontAwesome name="bank" size={13} />
            <Text>Connect bank for payouts</Text>
          </View>
        </Button>
      </View>
    </View>
  );
}

function ReceiptRow({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text
        className={`text-xs font-semibold ${monospace ? "tabular-nums" : ""}`}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function formatCents(cents: number): string {
  if (cents % 100 === 0) return `$${(cents / 100).toFixed(0)}`;
  return `$${(cents / 100).toFixed(2)}`;
}
