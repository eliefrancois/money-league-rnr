import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSession } from "~/context";
import { useProfile } from "~/context/profile";
import {
  MIN_AGE,
  US_STATES,
  calculateAge,
  formatDateForDB,
  isRestrictedState,
} from "~/lib/eligibility";
import { useColorScheme } from "~/lib/useColorScheme";
import { supabase } from "~/utils/supabase";

// Implements APP_FLOW.md Screen 1.2.5 / TECH_SPEC.md §10 Checkpoint 1.
//
// Self-declared age + state of residence. Three outcomes:
//   1. Age < 18              → /(signIn)/underage  (mark profile suspended)
//   2. State ∈ restricted    → /(signIn)/restricted (mark profile suspended,
//                              waitlist email captured on next screen)
//   3. Both pass             → write profile fields + geo_status='declared',
//                              RoutingGate routes to /(app)/

export default function EligibilityScreen() {
  const { user, signOut } = useSession();
  const { refetch } = useProfile();
  const { isDarkColorScheme } = useColorScheme();

  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [stateCode, setStateCode] = useState<string>("");
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dobDate = useMemo(() => {
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    if (!m || !d || !y || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) {
      return null;
    }
    if (year.length !== 4) return null;
    const date = new Date(y, m - 1, d);
    if (
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
    ) {
      return null;
    }
    if (date > new Date()) return null;
    return date;
  }, [month, day, year]);

  const age = useMemo(() => calculateAge(dobDate), [dobDate]);
  const dobComplete = month.length > 0 && day.length > 0 && year.length === 4;
  const dobValid = age != null;
  const ageOk = dobValid && (age as number) >= MIN_AGE;
  const stateRestricted = isRestrictedState(stateCode);
  // Continue is enabled as soon as the form is filled with a parseable
  // date and a state. The submit handler decides the outcome:
  // underage → /underage, restricted state → /restricted, otherwise →
  // /(app). We deliberately don't gate on eligibility here so the user
  // gets a clear "here's why you can't proceed" screen instead of a dead
  // button with no path forward.
  const canContinue = dobValid && stateCode !== "";

  const handleContinue = async () => {
    if (!user?.id || !dobDate) return;

    // Underage / restricted-state paths: delete the auth.users row via the
    // eligibility-fail-cleanup edge function so the email isn't burned.
    // We pass the email + state through nav params before invoking the
    // function (the user object becomes invalid afterwards). Local session
    // is left intact on purpose — the block screens use it briefly (e.g.
    // restricted's waitlist insert uses the still-cached anon path post-
    // delete) before the user taps the CTA, which calls signOut.
    const failCleanup = async (reason: "underage" | "restricted_state") => {
      const { error } = await supabase.functions.invoke(
        "eligibility-fail-cleanup",
        { body: { reason } },
      );
      if (error) {
        console.warn("[eligibility] cleanup failed:", error.message);
      }
    };

    if (age != null && age < MIN_AGE) {
      setSubmitting(true);
      await failCleanup("underage");
      router.replace("/(signIn)/underage");
      return;
    }

    if (stateRestricted) {
      setSubmitting(true);
      const emailParam = user.email ?? "";
      await failCleanup("restricted_state");
      router.replace({
        pathname: "/(signIn)/restricted",
        params: { state: stateCode, email: emailParam },
      });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        date_of_birth: formatDateForDB(dobDate),
        location_state: stateCode,
        geo_status: "declared",
      })
      .eq("id", user.id);

    if (error) {
      setSubmitting(false);
      Alert.alert("Couldn't save", error.message);
      return;
    }

    await refetch();
  };

  const handleBack = async () => {
    // "Back" before passing eligibility = abandon signup. Sign out so the
    // user lands back on the welcome / sign-in screen with a clean slate.
    await signOut();
  };

  return (
    <View className="flex-1 bg-background">
      <View className="px-5 pt-14 pb-3 flex-row items-center justify-between">
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center"
          accessibilityLabel="Back"
        >
          <FontAwesome
            name="chevron-left"
            size={18}
            color={isDarkColorScheme ? "#FAFAFA" : "#0A0A0F"}
          />
        </Pressable>
        <ProgressDots step={2} total={3} />
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        contentContainerClassName="px-6 pb-32 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-3xl font-bold tracking-tight">
          A few quick details
        </Text>
        <Text className="text-sm text-muted-foreground mt-2 leading-5">
          We need this to keep PotKeeper compliant in your state.
        </Text>

        <View className="mt-7 gap-1.5">
          <Text className="text-xs font-semibold text-muted-foreground">
            Date of birth
          </Text>
          <View className="flex-row gap-2">
            <DOBInput
              placeholder="MM"
              maxLength={2}
              value={month}
              onChange={setMonth}
              flex={1}
            />
            <DOBInput
              placeholder="DD"
              maxLength={2}
              value={day}
              onChange={setDay}
              flex={1}
            />
            <DOBInput
              placeholder="YYYY"
              maxLength={4}
              value={year}
              onChange={setYear}
              flex={1.4}
            />
          </View>
          {dobComplete && !ageOk && age != null ? (
            <View className="flex-row items-center gap-1.5 mt-1">
              <FontAwesome name="exclamation-circle" size={12} color="#EF4444" />
              <Text className="text-xs text-red-500">
                You must be {MIN_AGE} or older.
              </Text>
            </View>
          ) : null}
          {dobComplete && age == null ? (
            <View className="flex-row items-center gap-1.5 mt-1">
              <FontAwesome name="exclamation-circle" size={12} color="#EF4444" />
              <Text className="text-xs text-red-500">
                Enter a valid date.
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-5 gap-1.5">
          <Text className="text-xs font-semibold text-muted-foreground">
            State of residence
          </Text>
          <Pressable
            onPress={() => setStateModalOpen((v) => !v)}
            className="rounded-2xl border border-border bg-card flex-row items-center px-4 h-12"
          >
            <Text
              className={`flex-1 ${stateCode ? "text-foreground" : "text-muted-foreground"}`}
            >
              {stateCode
                ? US_STATES.find((s) => s.code === stateCode)?.name ?? stateCode
                : "Choose your state"}
            </Text>
            <FontAwesome
              name={stateModalOpen ? "chevron-up" : "chevron-down"}
              size={12}
              color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
          </Pressable>
          {stateModalOpen ? (
            <View className="rounded-2xl border border-border bg-card max-h-72 overflow-hidden mt-1">
              <ScrollView keyboardShouldPersistTaps="handled">
                {US_STATES.map((s) => (
                  <Pressable
                    key={s.code}
                    onPress={() => {
                      setStateCode(s.code);
                      setStateModalOpen(false);
                    }}
                    className={`flex-row items-center justify-between px-4 py-3 border-b border-border/40 ${
                      stateCode === s.code ? "bg-primary/10" : ""
                    } active:opacity-70`}
                  >
                    <Text className="font-medium">{s.name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {s.code}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {stateRestricted ? (
            <View className="flex-row items-start gap-1.5 mt-1">
              <FontAwesome
                name="exclamation-circle"
                size={12}
                color="#F59E0B"
                style={{ marginTop: 2 }}
              />
              <Text className="text-xs text-amber-500 flex-1">
                PotKeeper isn't available in {stateCode} yet.
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-7 rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4 flex-row gap-2.5">
          <FontAwesome
            name="shield"
            size={14}
            color="#6366f1"
            style={{ marginTop: 2 }}
          />
          <Text className="text-xs text-muted-foreground leading-5 flex-1">
            PotKeeper is available to US residents {MIN_AGE} and older in
            eligible states. Members in WA, ID, HI, MT, NV, and parts of LA
            can't join right now. We use this info only for compliance.
          </Text>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-background px-6 py-4">
        <Button
          onPress={handleContinue}
          disabled={!canContinue || submitting}
          className="w-full"
        >
          {submitting ? <ActivityIndicator /> : <Text className="font-bold">Continue</Text>}
        </Button>
        <Text className="text-[10px] text-muted-foreground text-center mt-2 leading-4 px-2">
          By continuing you confirm this information is accurate. False
          information may result in account termination.
        </Text>
      </View>
    </View>
  );
}

function DOBInput({
  placeholder,
  maxLength,
  value,
  onChange,
  flex,
}: {
  placeholder: string;
  maxLength: number;
  value: string;
  onChange: (v: string) => void;
  flex: number;
}) {
  const { isDarkColorScheme } = useColorScheme();
  return (
    <View
      style={{ flex }}
      className="rounded-2xl border border-border bg-card h-12 px-3 justify-center"
    >
      <TextInput
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={isDarkColorScheme ? "#666" : "#9ca3af"}
        maxLength={maxLength}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ""))}
        className="text-center font-semibold text-base text-foreground"
        style={{
          color: isDarkColorScheme ? "#FAFAFA" : "#0A0A0F",
          fontVariant: ["tabular-nums"],
        }}
      />
    </View>
  );
}

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <View className="flex-row gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          className={`h-1.5 rounded-full ${
            i + 1 <= step ? "bg-primary" : "bg-border"
          }`}
          style={{ width: i + 1 === step ? 24 : 6 }}
        />
      ))}
    </View>
  );
}
