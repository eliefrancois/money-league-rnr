import { Alert, StyleSheet, View } from "react-native";
import { Text } from "~/components/ui/text";
import { useSession } from "~/context";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";


export default function ModalScreen() {
  const { signOut, user } = useSession();

  async function handleSignOut(): Promise<void> {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Sign Out",
        onPress: async () => {
          try {
            await signOut();
          } catch (error) {
            console.error("Error signing out", error);
            Alert.alert("Error", "Failed to sign out");
          }
        },
      },
    ]);
  }

  return (
        <View style={styles.container}>
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-center">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <View>
                <Text className="font-bold">Name</Text>
                <Text>{user?.user_metadata?.full_name || 'Not set'}</Text>
              </View>
              <View>
                <Text className="font-bold">Email</Text>
                <Text>{user?.email || 'Not set'}</Text>
              </View>
              <View>
                <Text className="font-bold">ESPN</Text>
                <Button variant="outline" onPress={() => {/* ESPN sync logic */}}>
                  <Text>Sync ESPN</Text>
                </Button>
              </View>
              <View>
                <Text className="font-bold">Sleeper</Text>
                <Button variant="outline" onPress={() => {/* Sleeper sync logic */}}>
                  <Text>Sync Sleeper</Text>
                </Button>
              </View>
              <View>
                <Text className="font-bold">Balance</Text>
                <Button variant="outline" onPress={() => {/* Withdrawal logic */}}>
                  <Text>Withdraw Earnings</Text>
                </Button>
              </View>
            </CardContent>
            <CardFooter>
              <Button
                variant="destructive"
                className="w-full"
                onPress={() => handleSignOut()}
              >
                <Text className="text-white">Sign Out</Text>
              </Button>
            </CardFooter>
          </Card>
        </View>
      );
    }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
});
