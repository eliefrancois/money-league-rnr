import React, { useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Text } from './ui/text'
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from './ui/card'
import { Label } from './ui/label'
import { supabase } from '~/utils/supabase'
import { useSession } from '~/context'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const {signIn } = useSession();
  const [value, setValue] = useState('signIn')
  const [showPassword, setShowPassword] = useState(false)
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
    // <View className="flex-1 justify-center items-center p-4">
    //   <Card className="w-full max-w-sm">
    //     <CardHeader>
    //       <Text className="text-2xl font-bold text-center">Authentication</Text>
    //     </CardHeader>
    //     <CardContent className="space-y-4">
    //       <View>
    //         <Text className="mb-1">Email</Text>
    //         <Input
    //           placeholder="Email"
    //           onChangeText={setEmail}
    //           value={email}
    //           autoCapitalize="none"
    //           keyboardType="email-address"
    //         />
    //       </View>
    //       <View>
    //         <Text className="mb-1">Password</Text>
    //         <Input
    //           placeholder="Password"
    //           onChangeText={setPassword}
    //           value={password}
    //           secureTextEntry={true}
    //           autoCapitalize="none"
    //         />
    //       </View>
    //     </CardContent>
    //     <CardFooter className="flex-col space-y-2">
    //       <Button
    //         onPress={signInWithEmail}
    //         disabled={loading}
    //         className="w-full"
    //       >
    //         <Text>Sign In</Text>
    //       </Button>
    //       <Button
    //         onPress={signUpWithEmail}
    //         disabled={loading}
    //         variant="outline"
    //         className="w-full"
    //       >
    //         <Text>Sign Up</Text>
    //       </Button>
    //     </CardFooter>
    //   </Card>
    // </View>
    <View className='flex-1 justify-center p-6'>
      <Tabs
        value={value}
        onValueChange={setValue}
        className='w-full max-w-[400px] mx-auto flex-col gap-1.5'
      >
        <TabsList className='flex-row w-full'>
          <TabsTrigger value='signIn' className='flex-1'>
            <Text>Sign In</Text>
          </TabsTrigger>
          <TabsTrigger value='signUp' className='flex-1'>
            <Text>Sign Up</Text>
          </TabsTrigger>
        </TabsList>
        <TabsContent value='signIn'>
          <Card>
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>
                Sign in to your account here.
              </CardDescription>
            </CardHeader>
            <CardContent className='gap-4 native:gap-2'>
              <View className='gap-1'>
                <Label nativeID='email'>Email</Label>
                <Input aria-aria-labelledby='email' placeholder='jondoe@gmail.com' onChangeText={setEmail} />
              </View>
              <View className='gap-1'>
                <Label nativeID='password'>Password</Label>
                <Input id='password' placeholder='********' secureTextEntry onChangeText={setPassword} />
              </View>
            </CardContent>
            <CardFooter>
              <Button onPress={signInWithEmail}>
                <Text>Sign In</Text>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value='signUp'>
          <Card>
            <CardHeader>
              <CardTitle>Sign Up</CardTitle>
              <CardDescription>
                Sign up to your account here.
              </CardDescription>
            </CardHeader>
            <CardContent className='gap-4 native:gap-2'>
              <View className='gap-1'>
                <Label nativeID='current'>Email</Label>
                <Input placeholder='jondoe@gmail.com' aria-labelledby='current' onChangeText={setEmail} />
              </View>
              <View className='gap-1'>
                <Label nativeID='new'>Password</Label>
                <View className="flex-row items-center">
                  <Input
                    placeholder='********'
                    aria-labelledby='new'
                    secureTextEntry={!showPassword}
                    onChangeText={setPassword}
                    className="flex-1"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} className="ml-2">
                    <Text>{showPassword ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                </View>
              </View>
            </CardContent>
            <CardFooter>
              <Button onPress={signUpWithEmail}>
                <Text>Sign Up</Text>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </View>
  )
}
