import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSession } from "~/context";
import { useProfile } from "~/context/profile";
import { useColorScheme } from "~/lib/useColorScheme";
import { supabase } from "~/utils/supabase";

// Wallet / "Get paid" screen — Flow 7 thin slice.
//
// Three states the user can be in, derived from profiles.stripe_*:
//   1. not_started:  stripe_account_id IS NULL
//   2. in_progress:  stripe_account_id set, payouts_enabled = false
//                    (sub-state distinguishes "incomplete" from "under
//                    review by Stripe")
//   3. active:       stripe_account_id set, payouts_enabled = true
//
// On focus we hit stripe-account-status to refresh from Stripe (the user
// may have just returned from the hosted onboarding flow). On the CTA we
// hit stripe-create-connect-account to either create the account or mint
// a fresh AccountLink, then open it in expo-web-browser.

type StripeStatus = {
  account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: {
    currently_due: string[];
    past_due: string[];
    eventually_due: string[];
    disabled_reason: string | null;
  };
};

type CreateAccountResponse = {
  account_id: string;
  onboarding_url: string;
  expires_at: number;
};

export default function WalletScreen() {
  const { user } = useSession();
  const { profile, refetch } = useProfile();
  const { isDarkColorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openingLink, setOpeningLink] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    const { data, error } = await supabase.functions.invoke<StripeStatus>(
      "stripe-account-status",
      { body: {} },
    );
    setRefreshing(false);
    if (error) {
      console.warn("[wallet] status fetch failed:", error.message);
    } else if (data) {
      setStatus(data);
    }
    // Always refetch the cached profile, even on error. The edge function
    // mirrors stripe_* columns server-side (including the "account
    // deleted" cleanup path), and ProfileProvider's cache stays stale
    // until we explicitly pull. Without this, deleting a Stripe account
    // out-of-band leaves the UI showing "Payouts enabled" forever.
    await refetch();
  }, [user?.id, refetch]);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, [refreshStatus]),
  );

  const handleStartOnboarding = async () => {
    setOpeningLink(true);
    const { data, error } = await supabase.functions.invoke<CreateAccountResponse>(
      "stripe-create-connect-account",
      { body: {} },
    );
    if (error || !data?.onboarding_url) {
      setOpeningLink(false);
      Alert.alert(
        "Couldn't start onboarding",
        error?.message ?? "Stripe didn't return an onboarding URL.",
      );
      return;
    }

    try {
      // openAuthSessionAsync watches for the in-app browser to navigate
      // to the redirect scheme, then auto-dismisses. The flow:
      //   Stripe Done → https://potkeeper.app/stripe-return (HTTPS, what
      //   Stripe demands) → that page does window.location.replace(
      //   'potkeeper://stripe-return') → iOS sees the custom scheme,
      //   collapses the auth session, and resolves this promise.
      // We refetch on both 'success' and 'cancel' (cancel still means
      // partial progress is possible).
      await WebBrowser.openAuthSessionAsync(
        data.onboarding_url,
        "potkeeper://stripe-return",
        { showInRecents: false },
      );
    } catch (e) {
      console.warn("[wallet] browser failed:", e);
    } finally {
      setOpeningLink(false);
      refreshStatus();
    }
  };

  // Derive the rendering state. Prefer the freshly-fetched `status` shape
  // when we have it; fall back to whatever profile.stripe_* says. This
  // covers the cold-start case before the first network roundtrip lands.
  const accountId = status?.account_id ?? profile?.stripe_account_id ?? null;
  const payoutsEnabled =
    status?.payouts_enabled ?? profile?.stripe_payouts_enabled ?? false;
  const detailsSubmitted =
    status?.details_submitted ?? profile?.stripe_details_submitted ?? false;
  const requirements = status?.requirements ?? null;

  const screenState: "not_started" | "in_progress" | "active" =
    accountId == null
      ? "not_started"
      : payoutsEnabled
        ? "active"
        : "in_progress";

  if (refreshing && status === null) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className="px-5 pb-2 flex-row items-center justify-between"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          onPress={() => {
            // Wallet is a hidden Tabs.Screen, so router.push from home
            // is a tab switch (no history). router.back() is a no-op
            // and router.canGoBack() is unreliable through tabs. Always
            // explicitly navigate to home — that's the only valid
            // "back" target since wallet doesn't have a parent stack.
            router.replace("/");
          }}
          hitSlop={16}
          className="h-10 w-10 items-center justify-center"
          accessibilityLabel="Back"
        >
          <FontAwesome
            name="chevron-left"
            size={18}
            color={isDarkColorScheme ? "#FAFAFA" : "#0A0A0F"}
          />
        </Pressable>
        <Text className="text-base font-semibold">Get paid</Text>
        <Pressable
          onPress={refreshStatus}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center"
          accessibilityLabel="Refresh status"
        >
          {refreshing ? (
            <ActivityIndicator size="small" />
          ) : (
            <FontAwesome
              name="refresh"
              size={16}
              color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-6 pb-32 pt-3">
        {screenState === "not_started" ? (
          <NotStartedState
            onStart={handleStartOnboarding}
            opening={openingLink}
          />
        ) : screenState === "in_progress" ? (
          <InProgressState
            onContinue={handleStartOnboarding}
            opening={openingLink}
            detailsSubmitted={detailsSubmitted}
            requirements={requirements}
          />
        ) : (
          <ActiveState lastUpdated={profile?.stripe_account_updated_at ?? null} />
        )}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// State 1 — Not started
// =============================================================================

function NotStartedState({
  onStart,
  opening,
}: {
  onStart: () => void;
  opening: boolean;
}) {
  return (
    <View className="gap-6">
      <View className="items-center pt-4">
        <View
          className="h-24 w-24 rounded-3xl items-center justify-center"
          style={{ backgroundColor: "rgba(34,197,94,0.12)" }}
        >
          <FontAwesome name="bank" size={42} color="#22C55E" />
        </View>
      </View>

      <View className="items-center gap-2">
        <Text className="text-3xl font-bold tracking-tight text-center">
          Set up your payout method
        </Text>
        <Text className="text-sm text-muted-foreground text-center leading-5 max-w-xs">
          We use Stripe to send winnings directly to your bank. Takes about 30
          seconds.
        </Text>
      </View>

      <View className="gap-2.5 mt-2">
        <Benefit
          icon="user"
          title="Verify your identity"
          subtitle="Stripe handles this securely"
        />
        <Benefit
          icon="university"
          title="Add a bank or debit card"
          subtitle="Instant verify via Plaid"
        />
        <Benefit
          icon="bolt"
          title="Auto-payout on wins"
          subtitle="Arrives 1–2 business days after standings finalize"
        />
      </View>

      <View className="gap-2 mt-2">
        <Button onPress={onStart} disabled={opening} className="w-full">
          {opening ? (
            <ActivityIndicator />
          ) : (
            <Text className="font-bold">Continue with Stripe</Text>
          )}
        </Button>
        <Text className="text-[11px] text-muted-foreground text-center leading-4 px-4">
          You'll be sent to Stripe's secure onboarding flow, then back here.
        </Text>
      </View>
    </View>
  );
}

// =============================================================================
// State 2 — In progress
// =============================================================================

function InProgressState({
  onContinue,
  opening,
  detailsSubmitted,
  requirements,
}: {
  onContinue: () => void;
  opening: boolean;
  detailsSubmitted: boolean;
  requirements: StripeStatus["requirements"] | null;
}) {
  const dueNow = requirements?.currently_due ?? [];
  const pastDue = requirements?.past_due ?? [];
  const disabledReason = requirements?.disabled_reason ?? null;

  // Three sub-states:
  //   - not yet submitted → continue setup
  //   - submitted, no items due, payouts not enabled → under review
  //   - submitted, items due → action needed
  const subState: "incomplete" | "review" | "action_needed" = !detailsSubmitted
    ? "incomplete"
    : dueNow.length === 0 && pastDue.length === 0
      ? "review"
      : "action_needed";

  const heading =
    subState === "incomplete"
      ? "Finish setting up payouts"
      : subState === "review"
        ? "Almost there"
        : "Stripe needs more info";

  const body =
    subState === "incomplete"
      ? "You started Stripe onboarding but didn't finish. Tap Continue to pick back up where you left off."
      : subState === "review"
        ? "Stripe is reviewing your info. This usually takes a few minutes, sometimes up to 24 hours. We'll auto-update once you're cleared."
        : "Stripe needs a bit more from you before payouts can be enabled. Tap Continue to provide what's missing.";

  return (
    <View className="gap-6">
      <View className="items-center pt-4">
        <View
          className="h-24 w-24 rounded-3xl items-center justify-center"
          style={{
            backgroundColor:
              subState === "review"
                ? "rgba(99,102,241,0.12)"
                : "rgba(245,158,11,0.12)",
          }}
        >
          <FontAwesome
            name={subState === "review" ? "hourglass-half" : "exclamation-circle"}
            size={42}
            color={subState === "review" ? "#6366f1" : "#F59E0B"}
          />
        </View>
      </View>

      <View className="items-center gap-2">
        <Text className="text-3xl font-bold tracking-tight text-center">
          {heading}
        </Text>
        <Text className="text-sm text-muted-foreground text-center leading-5 max-w-xs">
          {body}
        </Text>
      </View>

      {subState === "action_needed" && (dueNow.length > 0 || pastDue.length > 0) ? (
        <View
          className="rounded-2xl border p-4 gap-2"
          style={{
            backgroundColor: "rgba(245,158,11,0.08)",
            borderColor: "rgba(245,158,11,0.3)",
          }}
        >
          <Text className="text-xs uppercase tracking-wide font-semibold text-amber-500">
            Items needed
          </Text>
          {[...pastDue, ...dueNow].map((item) => (
            <View key={item} className="flex-row items-center gap-2">
              <FontAwesome name="circle-o" size={6} color="#F59E0B" />
              <Text className="text-sm text-foreground">
                {humanizeRequirement(item)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {disabledReason ? (
        <View
          className="rounded-2xl border border-red-500/30 p-3"
          style={{ backgroundColor: "rgba(239,68,68,0.08)" }}
        >
          <Text className="text-xs text-red-500">
            Stripe disabled status: {disabledReason}
          </Text>
        </View>
      ) : null}

      {subState !== "review" ? (
        <Button onPress={onContinue} disabled={opening} className="w-full">
          {opening ? (
            <ActivityIndicator />
          ) : (
            <Text className="font-bold">Continue with Stripe</Text>
          )}
        </Button>
      ) : null}
    </View>
  );
}

// =============================================================================
// State 3 — Active
// =============================================================================

function ActiveState({ lastUpdated }: { lastUpdated: string | null }) {
  return (
    <View className="gap-6">
      <View className="items-center pt-4">
        <View
          className="h-24 w-24 rounded-3xl items-center justify-center"
          style={{ backgroundColor: "#22C55E" }}
        >
          <FontAwesome name="check" size={42} color="#fff" />
        </View>
      </View>

      <View className="items-center gap-2">
        <Text className="text-3xl font-bold tracking-tight text-center">
          You're all set
        </Text>
        <Text className="text-sm text-muted-foreground text-center leading-5 max-w-xs">
          Winnings will arrive in your bank automatically, 1–2 business days
          after league standings finalize.
        </Text>
      </View>

      <View
        className="rounded-2xl border border-border bg-card p-4 flex-row items-center gap-3"
      >
        <View
          className="h-11 w-11 rounded-xl items-center justify-center"
          style={{ backgroundColor: "rgba(34,197,94,0.18)" }}
        >
          <FontAwesome name="bank" size={18} color="#22C55E" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold">Payouts enabled</Text>
          <Text className="text-xs text-muted-foreground">
            Connected via Stripe Express
          </Text>
        </View>
        <View
          className="px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
        >
          <Text className="text-[11px] font-bold text-green-600">Verified</Text>
        </View>
      </View>

      {lastUpdated ? (
        <Text className="text-[11px] text-muted-foreground text-center">
          Last synced {new Date(lastUpdated).toLocaleString()}
        </Text>
      ) : null}
    </View>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function Benefit({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof FontAwesome.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View className="rounded-2xl border border-border bg-card p-3.5 flex-row items-center gap-3">
      <View
        className="h-9 w-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
      >
        <FontAwesome name={icon} size={16} color="#22C55E" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold">{title}</Text>
        <Text className="text-xs text-muted-foreground mt-0.5">{subtitle}</Text>
      </View>
    </View>
  );
}

// Stripe requirement strings are in dotted form (e.g. "individual.dob.day",
// "external_account"). Map the most common ones to human-readable copy. The
// catch-all just shows the raw key — better than nothing, and we can expand
// the dictionary as we see them in the wild.
function humanizeRequirement(key: string): string {
  const map: Record<string, string> = {
    "external_account": "Bank account or debit card",
    "individual.dob.day": "Date of birth",
    "individual.dob.month": "Date of birth",
    "individual.dob.year": "Date of birth",
    "individual.first_name": "Legal first name",
    "individual.last_name": "Legal last name",
    "individual.id_number": "SSN",
    "individual.ssn_last_4": "Last 4 of SSN",
    "individual.address.line1": "Home address",
    "individual.address.city": "Home address",
    "individual.address.state": "Home address",
    "individual.address.postal_code": "Home address ZIP",
    "individual.email": "Email",
    "individual.phone": "Phone number",
    "individual.verification.document": "Photo ID",
    "tos_acceptance.date": "Stripe terms of service",
    "tos_acceptance.ip": "Stripe terms of service",
    "business_profile.url": "Business URL",
    "business_profile.mcc": "Business category",
  };
  if (map[key]) return map[key];
  // Strip the namespace prefix and replace separators for unknown keys.
  return key.replace(/^individual\./, "").replace(/[._]/g, " ");
}
