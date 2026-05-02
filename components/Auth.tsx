import React, { useState } from 'react'
import { Alert, Image, Pressable, View } from 'react-native'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Text } from './ui/text'
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from './ui/card'
import { Label } from './ui/label'
import { useSession } from '~/context'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp } = useSession();
  const [value, setValue] = useState('signIn')
  const [showPassword, setShowPassword] = useState(false)

  async function signInWithEmail() {
    setLoading(true)
    const { error } = await signIn(email, password)
    // Routing happens reactively via RoutingGate when the session updates;
    // no need to navigate here.
    if (error) Alert.alert(error.message)
    setLoading(false)
  }

  async function signUpWithEmail() {
    setLoading(true)
    const { error } = await signUp(email, password)
    // On success the dev-only auto-confirm trigger signs the user in
    // immediately; SessionProvider sees SIGNED_IN, RoutingGate sends them
    // to /(signIn)/eligibility. No alert needed in the happy path.
    // (Production note: with email confirmation enabled this becomes a
    // "check your inbox" toast — wire that when we flip the flag.)
    if (error) Alert.alert(error.message)
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
    <View className='flex-1 justify-center p-6 gap-6'>
      <View className='items-center'>
        <Image
          source={require('~/assets/images/potkeeper-primary.png')}
          style={{ width: 240, height: 80 }}
          resizeMode='contain'
        />
        <Text className='text-xs text-muted-foreground mt-1'>
          Keep the pot. Skip the drama.
        </Text>
      </View>
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
