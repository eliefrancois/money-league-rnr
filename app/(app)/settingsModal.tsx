import { StatusBar } from 'expo-status-bar';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { useColorScheme } from '~/lib/useColorScheme';
import { Text } from '~/components/ui/text';
import { useSession } from '~/context';
import { Button } from '~/components/ui/button';

export default function ModalScreen() {
    const { signOut } = useSession();

    async function handleSignOut(): Promise<void> {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        {
          text: 'Cancel',
          style: 'cancel',    
        },
        {
          text: 'Sign Out',
          onPress: async () => {
            try {   
              await signOut();
            } catch (error) {
              console.error("Error signing out", error);
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]);
    }

  return (
    <View style={styles.container}>
      <View style={styles.separator} />
      <Text>Settings</Text>
      <Button variant='destructive' className='text-sm text-red-600' onPress={() => handleSignOut()}>
            <Text>Sign Out</Text>
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
  titleDark: {
    color: 'white',
  },
  titleLight: {
    color: 'black',
  },
});
