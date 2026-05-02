import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import { useSession } from "~/context";
import { getStateName } from "~/lib/eligibility";
import { useColorScheme } from "~/lib/useColorScheme";
import { supabase } from "~/utils/supabase";

// APP_FLOW.md Screen 1.2.6b / TECH_SPEC.md §10 Checkpoint 1 (restricted state
// block). Profile is suspended, but we capture the email into
// restricted_state_waitlist so we can email when the state legalizes.
// Back button returns to eligibility (in case the user picked the wrong
// state — they can correct it and continue if their actual state is fine).

export default function RestrictedStateScreen() {
  // The eligibility screen passes both `state` and `email` as nav params
  // because by the time we render here the auth.users row has been deleted
  // by the eligibility-fail-cleanup edge function — `useSession().user` is
  // briefly stale and we don't want to read a soon-to-be-invalid email
  // from it.
  const { state, email: emailParam } = useLocalSearchParams<{
    state?: string;
    email?: string;
  }>();
  const { signOut } = useSession();
  const { isDarkColorScheme } = useColorScheme();

  const stateCode = state ?? "";
  const stateName = getStateName(stateCode) || "your state";
  const [email, setEmail] = useState(emailParam ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setSubmitting(true);

    // Plain insert (not upsert) so we don't trigger the UPDATE branch of
    // ON CONFLICT — we have no UPDATE policy on restricted_state_waitlist
    // and don't want one (write-only table). Treat the unique-violation
    // error code 23505 as a successful-but-already-on-list outcome.
    const { error: insertError } = await supabase
      .from("restricted_state_waitlist")
      .insert({ email, state: stateCode, source: "signup" });

    setSubmitting(false);
    if (insertError && insertError.code !== "23505") {
      setError(insertError.message);
      return;
    }
    setSubmitted(true);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="px-5 pt-14 pb-3 flex-row items-center">
        <Pressable
          onPress={() => router.replace("/(signIn)/eligibility")}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center"
          accessibilityLabel="Back to eligibility form"
        >
          <FontAwesome
            name="chevron-left"
            size={18}
            color={isDarkColorScheme ? "#FAFAFA" : "#0A0A0F"}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerClassName="px-6 pb-32 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <View
          className="h-20 w-20 rounded-3xl items-center justify-center mb-5"
          style={{ backgroundColor: "rgba(245,158,11,0.12)" }}
        >
          <FontAwesome name="map-pin" size={32} color="#F59E0B" />
        </View>

        <Text className="text-3xl font-bold tracking-tight">
          Not in {stateName} yet
        </Text>
        <Text className="text-sm text-muted-foreground mt-2.5 leading-5">
          PotKeeper isn't available in your state right now because of state
          law. We're working on changing that.
        </Text>

        {!submitted ? (
          <View className="mt-7 gap-2">
            <Text className="text-sm font-semibold">
              Get notified when PotKeeper comes to {stateName}
            </Text>
            <Input
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError(null);
              }}
            />
            {error ? (
              <Text className="text-xs text-red-500">{error}</Text>
            ) : null}
            <Button
              onPress={handleSubmit}
              disabled={submitting}
              className="w-full mt-2"
            >
              <Text className="font-bold">Notify me</Text>
            </Button>
          </View>
        ) : (
          <View
            className="mt-7 rounded-2xl border p-4 flex-row items-center gap-3"
            style={{
              backgroundColor: "rgba(34,197,94,0.08)",
              borderColor: "rgba(34,197,94,0.3)",
            }}
          >
            <View className="h-9 w-9 rounded-xl items-center justify-center bg-green-500">
              <FontAwesome name="check" size={14} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="font-semibold">You're on the list</Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                We'll email you the moment {stateName} opens up.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 px-6 py-6">
        <Pressable onPress={() => signOut()} className="w-full py-3">
          <Text className="text-center text-muted-foreground font-medium">
            Back to start
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
