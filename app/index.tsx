import React, { useState } from 'react'
import { Alert, View } from 'react-native'
import { Card, CardHeader, CardContent, CardFooter } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { supabase } from '~/utils/supabase'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function signInWithEmail() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    })
    
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
      <Text>Sign in</Text>
    </View>
  )
}
