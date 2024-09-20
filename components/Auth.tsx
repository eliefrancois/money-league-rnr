import React, { useState } from 'react'
import { Alert, View } from 'react-native'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Text } from './ui/text'
import { Card, CardHeader, CardContent, CardFooter } from './ui/card'
import { supabase } from '~/utils/supabase'
import { useSession } from '~/context'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const {signIn } = useSession();

  async function signInWithEmail() {
    setLoading(true)
    const { error } = await signIn(
      email,
      password,
    )
    
    if (error) {
      Alert.alert(error.message)
    } else {
      Alert.alert('Signed in successfully!')
    }
    setLoading(false)
  }

  async function signUpWithEmail() {
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: email,
      password: password,
    })

    if (error) {
      Alert.alert(error.message)
    } else {
      Alert.alert('Please check your inbox for email verification!')
    }
    setLoading(false)
  }

  return (
    <View className="flex-1 justify-center items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Text className="text-2xl font-bold text-center">Authentication</Text>
        </CardHeader>
        <CardContent className="space-y-4">
          <View>
            <Text className="mb-1">Email</Text>
            <Input
              placeholder="Email"
              onChangeText={setEmail}
              value={email}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <View>
            <Text className="mb-1">Password</Text>
            <Input
              placeholder="Password"
              onChangeText={setPassword}
              value={password}
              secureTextEntry={true}
              autoCapitalize="none"
            />
          </View>
        </CardContent>
        <CardFooter className="flex-col space-y-2">
          <Button
            onPress={signInWithEmail}
            disabled={loading}
            className="w-full"
          >
            <Text>Sign In</Text>
          </Button>
          <Button
            onPress={signUpWithEmail}
            disabled={loading}
            variant="outline"
            className="w-full"
          >
            <Text>Sign Up</Text>
          </Button>
        </CardFooter>
      </Card>
    </View>
  )
}
