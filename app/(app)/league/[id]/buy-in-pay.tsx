import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSession } from "~/context";
import type { Tables } from "~/lib/database.types";
import { supabase } from "~/utils/supabase";

// Pay Buy-in screen (APP_FLOW.md Flow 5, Screen 5.1).
//
// Pass 1 simplifications vs the spec:
//   - No saved payment method UI ("Pay with Visa ····4242"). The first
//     buy-in *is* the SetupIntent moment — Stripe Checkout collects the
//     billing address, the webhook reads it for Checkpoint 2/3. Saved
//     methods + skip-Checkout-second-time-around lands in Pass 2.
//   - No platform fee line item. We just charge buy_in_cents flat;
//     Stripe's processing fee is absorbed by PotKeeper. Per-fee_payer
//     accounting ships in Pass 2.
//
// Flow:
//   1. Mount → load league + verify caller's member row + payment_status
//   2. User checks consent + taps "Pay $X"
//   3. Call stripe-create-buy-in-session → get checkout_url
//   4. Open in openAuthSessionAsync watching for potkeeper://buy-in-return
//   5. On dismiss, navigate to the receipt screen (which polls the
//      league_member.payment_status to confirm the webhook landed)

type League = Tables<"leagues">;
type LeagueMember = Tables<"league_members">;

type CreateSessionResponse = {
  checkout_url: string;
  session_id: string;
};

export default function BuyInPayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [league, setLeague] = useState<League | null>(null);
  const [member, setMember] = useState<LeagueMember | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!id || !user?.id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [leagueRes, memberRes, countRes] = await Promise.all([
        supabase.from("leagues").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("league_members")
          .select("*")
          .eq("league_id", id)
          .eq("linked_profile_id", user.id)
          .maybeSingle(),
        supabase
          .from("league_members")
          .select("id", { count: "exact", head: true })
          .eq("league_id", id),
      ]);

      if (cancelled) return;

      if (leagueRes.error || !leagueRes.data) {
        setError(leagueRes.error?.message ?? "League not found.");
        setLoading(false);
        return;
      }
      if (memberRes.error) {
        setError(memberRes.error.message);
        setLoading(false);
        return;
      }
      if (!memberRes.data) {
        setError("You're not a member of this league.");
        setLoading(false);
        return;
      }
      if (memberRes.data.payment_status === "paid") {
        // Already paid — skip ahead to the receipt for this league.
        router.replace({
          pathname: "/league/[id]/receipt",
          params: { id },
        });
        return;
      }

      setLeague(leagueRes.data);
      setMember(memberRes.data);
      setMemberCount(countRes.count ?? leagueRes.data.total_rosters ?? 0);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  const handlePay = useCallback(async () => {
    if (!league || !member || !id) return;
    setPaying(true);

    const { data, error: invokeError } = await supabase.functions.invoke<
      CreateSessionResponse
    >("stripe-create-buy-in-session", {
      body: { league_id: league.id },
    });

    if (invokeError || !data?.checkout_url) {
      setPaying(false);
      Alert.alert(
        "Couldn't start checkout",
        invokeError?.message ?? "Stripe didn't return a checkout URL.",
      );
      return;
    }

    let result: WebBrowser.WebBrowserAuthSessionResult;
    try {
      // Same auth-session pattern as the wallet/Connect onboarding flow.
      // Stripe lands on potkeeper.app/buy-in-return → that page does
      // window.location.replace('potkeeper://buy-in-return') → iOS
      // catches the scheme and dismisses the in-app browser. We capture
      // the result so we can distinguish "Stripe redirected to our
      // success/cancel URL" (`type: 'success'`) from "user manually
      // dismissed the sheet" (`type: 'dismiss'` / `'cancel'`).
      result = await WebBrowser.openAuthSessionAsync(
        data.checkout_url,
        "potkeeper://buy-in-return",
        { showInRecents: false },
      );
    } catch (e) {
      console.warn("[buy-in-pay] browser session failed:", e);
      setPaying(false);
      Alert.alert(
        "Browser error",
        "Something went wrong opening the checkout. Try again.",
      );
      return;
    }

    setPaying(false);

    // 'success' = Stripe redirected to either success_url or cancel_url
    //             (both go through potkeeper.app/buy-in-return → custom
    //             scheme). Inspect the URL to know which.
    // 'cancel' / 'dismiss' = user X'd out of the sheet themselves.
    if (result.type !== "success" || !result.url) {
      // User manually dismissed before completing or cancelling on
      // Stripe's side. Don't navigate to the receipt — that would
      // burn 30 seconds polling for nothing. Stay here so they can
      // retry without re-entering the consent checkbox.
      return;
    }

    // The cancel_url has `?cancelled=1` — distinguish from real success.
    const isCancelled = result.url.includes("cancelled=1");
    if (isCancelled) {
      Alert.alert(
        "Payment cancelled",
        "Your card wasn't charged. You can try again whenever you're ready.",
      );
      return;
    }

    // Real success path: Stripe redirected to success_url. The webhook
    // should have already fired or be about to. Receipt screen polls
    // league_members.payment_status to confirm.
    router.replace({
      pathname: "/league/[id]/receipt",
      params: { id: league.id, session_id: data.session_id },
    });
  }, [league, member, id]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-secondary/30">
        <ActivityIndicator />
      </View>
    );
  }
  if (error || !league || !member) {
    return (
      <View className="flex-1 items-center justify-center gap-3 p-6 bg-secondary/30">
        <FontAwesome name="exclamation-triangle" size={32} color="#f59e0b" />
        <Text className="text-center">{error ?? "Couldn't load league"}</Text>
        <Button variant="secondary" onPress={() => router.back()}>
          <Text>Back</Text>
        </Button>
      </View>
    );
  }

  const buyIn = league.buy_in_cents ?? 0;
  const totalPot = buyIn * (memberCount || league.total_rosters || 0);

  return (
    <View className="flex-1 bg-secondary/30">
      <ScrollView contentContainerClassName="p-5 gap-4 pb-32">
        {/* League card — compact context so they remember what they're buying into */}
        <View className="rounded-2xl border border-border bg-card p-4 gap-3">
          <View>
            <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              You're paying into
            </Text>
            <Text className="text-lg font-extrabold mt-0.5">{league.name}</Text>
            <Text className="text-xs text-muted-foreground">
              {league.season} · {memberCount || league.total_rosters || 0} teams
            </Text>
          </View>
          <View className="border-t border-border pt-3 flex-row items-center justify-between">
            <View>
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Total pot
              </Text>
              <Text className="text-base font-bold mt-0.5">
                {formatCents(totalPot)}
              </Text>
            </View>
            <View>
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Your team
              </Text>
              <Text className="text-base font-bold mt-0.5">
                {member.team_name ??
                  member.external_display_name ??
                  member.external_username ??
                  "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* Big amount */}
        <View className="items-center my-2">
          <Text className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            You pay now
          </Text>
          <Text className="text-5xl font-black tracking-tight mt-1">
            {formatCents(buyIn)}
          </Text>
        </View>

        {/* Breakdown — kept simple in Pass 1; we don't pass through Stripe's
            processing fee yet so this is a one-line breakdown. The
            "platform fee at payout" line is intentionally informational
            (the dollar value we'd take at season-end), not part of this
            charge. */}
        <View className="rounded-2xl border border-border bg-card p-4 gap-2.5">
          <BreakdownRow label="Buy-in" value={formatCents(buyIn)} />
          <View className="border-t border-border" />
          <BreakdownRow
            label="Platform fee (at payout)"
            value="2.5% of winnings"
            muted
          />
          <BreakdownRow
            label="Processing"
            value="Covered by PotKeeper"
            muted
          />
          <View className="border-t border-border" />
          <BreakdownRow label="Total" value={formatCents(buyIn)} bold />
        </View>

        {/* Trust strip */}
        <View className="rounded-2xl border border-border bg-card p-3 flex-row items-center gap-3">
          <View className="h-8 w-8 rounded-lg bg-blue-500/15 items-center justify-center">
            <FontAwesome name="lock" size={13} color="#3b82f6" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-semibold">
              Your buy-in is held in escrow
            </Text>
            <Text className="text-[11px] text-muted-foreground mt-0.5">
              Stripe holds the pot until standings finalize. Auto-paid to
              winners — no commissioner middle-man.
            </Text>
          </View>
        </View>

        {/* Consent checkbox — required by APP_FLOW.md Screen 5.1 to
            establish chargeback-defensible authorization. */}
        <Pressable
          onPress={() => setConsented((c) => !c)}
          className="rounded-2xl border border-border bg-card p-4 flex-row gap-3 active:opacity-80"
        >
          <View
            className={`h-5 w-5 rounded-md items-center justify-center mt-0.5 ${
              consented ? "bg-green-500 border-green-500" : "border-2 border-border"
            }`}
          >
            {consented ? (
              <FontAwesome name="check" size={11} color="#fff" />
            ) : null}
          </View>
          <Text className="flex-1 text-xs leading-5">
            I authorize this {formatCents(buyIn)} charge for entry into{" "}
            <Text className="font-bold">{league.name}</Text>. I understand
            winnings will be paid out at season end based on final standings,
            and that buy-ins are non-refundable once the season starts.
          </Text>
        </Pressable>
      </ScrollView>

      {/* Sticky pay button */}
      <View className="absolute left-0 right-0 bottom-0 px-5 pb-8 pt-3 bg-secondary/95 border-t border-border">
        <Button
          onPress={handlePay}
          disabled={!consented || paying}
          className="w-full"
        >
          {paying ? (
            <ActivityIndicator />
          ) : (
            <Text className="font-bold">
              {consented ? `Pay ${formatCents(buyIn)}` : "Authorize to continue"}
            </Text>
          )}
        </Button>
        <Text className="text-[10px] text-muted-foreground text-center mt-2">
          Secure checkout powered by Stripe
        </Text>
      </View>
    </View>
  );
}

function BreakdownRow({
  label,
  value,
  bold = false,
  muted = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text
        className={`text-sm ${
          muted ? "text-muted-foreground" : ""
        } ${bold ? "font-bold" : ""}`}
      >
        {label}
      </Text>
      <Text
        className={`text-sm tabular-nums ${
          muted ? "text-muted-foreground" : ""
        } ${bold ? "font-extrabold" : "font-semibold"}`}
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
