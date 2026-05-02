import { View } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSession } from "~/context";
import { MIN_AGE } from "~/lib/eligibility";

// APP_FLOW.md Screen 1.2.6a / TECH_SPEC.md §10 Checkpoint 1 (underage block).
//
// Hard stop. Profile has been marked geo_status='suspended' by the
// eligibility submit. The only forward action is "I understand" — which
// signs the user out so they land on the welcome screen with a clean
// session. The auth row stays in supabase to prevent re-signups with the
// same email (per spec).

export default function UnderageScreen() {
  const { signOut } = useSession();

  return (
    <View className="flex-1 bg-background pt-14">
      <View className="flex-1 items-center justify-center px-8 gap-3">
        <View
          className="h-24 w-24 rounded-3xl items-center justify-center mb-4"
          style={{ backgroundColor: "rgba(99,102,241,0.12)" }}
        >
          <FontAwesome name="hourglass-half" size={36} color="#6366f1" />
        </View>
        <Text className="text-3xl font-bold tracking-tight text-center">
          PotKeeper is {MIN_AGE}+
        </Text>
        <Text className="text-center text-muted-foreground leading-5 max-w-xs">
          PotKeeper requires you to be {MIN_AGE} or older to use the app.
          Come back when you're old enough — fantasy leagues will still be
          here.
        </Text>
      </View>
      <View className="px-6 pb-10">
        <Button onPress={() => signOut()} className="w-full">
          <Text className="font-bold">I understand</Text>
        </Button>
      </View>
    </View>
  );
}
