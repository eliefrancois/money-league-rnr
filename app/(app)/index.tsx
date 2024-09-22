import { Alert, View } from 'react-native';
import Animated, { FadeInUp, FadeOutDown, LayoutAnimationConfig } from 'react-native-reanimated';
import { Info } from '~/lib/icons/Info';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Progress } from '~/components/ui/progress';
import { Text } from '~/components/ui/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { useSession } from '~/context';
import { useEffect, useState } from 'react';
import { getProfile, supabase } from '~/utils/supabase';
import { Image } from 'react-native';
const GITHUB_AVATAR_URI =
  'https://i.pinimg.com/originals/ef/a2/8d/efa28d18a04e7fa40ed49eeb0ab660db.jpg';

export default function Screen() {
  const [progress, setProgress] = useState(78);
  const { user } = useSession();
  const [profile, setProfile] = useState<any>(null);
  function updateProgressValue() {
    setProgress(Math.floor(Math.random() * 100));
  }


  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        const { data, error } = await getProfile(user.id)
        if (error) {
          console.error('Error fetching profile:', error);
        } else {
          console.log('User profile:', data);
          setProfile(data)
        }
      }
      fetchProfile()
    }
  }, [user])




  return (

    <View className='flex-1 justify-center items-center gap-5 p-6 bg-secondary/30'>
      <Text className="text-2xl font-bold mb-4">Sync Your League</Text>
      {
        profile?.is_espn_synced ? (
          <Text>Synced</Text>
        ) : (
          <Button onPress={() => {
            Alert.alert('Coming Soon', 'This feature is coming soon')
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image source={require('~/assets/league_sync/espn_icon.jpeg')} resizeMode='contain' style={{ width: 34, height: 34, marginRight: 8 }} />
              <Text>Sync ESPN</Text>
            </View>
          </Button>
        )
      }
      {
        profile?.is_sleeper_synced ? (
          <Text>Synced</Text>
        ) : (
          <Button onPress={() => {
            Alert.alert('Coming Soon', 'This feature is coming soon')
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image source={require('~/assets/league_sync/sleeper_icon.jpg')} style={{ width: 34, height: 34, marginRight: 8 }} />
              <Text>Sync Sleeper</Text>
            </View>
          </Button>
        )
      }
      {
        profile?.is_yahoo_synced ? (
          <Text>Synced</Text>
        ) : (
          <Button onPress={() => {
            Alert.alert('Coming Soon', 'This feature is coming soon')
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image source={require('~/assets/league_sync/yahoo_icon.png')} style={{ width: 34, height: 34, marginRight: 8 }} />
              <Text>Sync Yahoo</Text>
            </View>
          </Button>
        ) 
      }
    </View>
    // <View className='flex-1 justify-center items-center gap-5 p-6 bg-secondary/30'>
    //   <Card className='w-full max-w-sm p-6 rounded-2xl'>
    //     <CardHeader className='items-center'>
    //       <Avatar alt="Rick Sanchez's Avatar" className='w-24 h-24'>
    //         <AvatarImage source={{ uri: GITHUB_AVATAR_URI }} />
    //         <AvatarFallback>
    //           <Text>RS</Text>
    //         </AvatarFallback>
    //       </Avatar>
    //       <View className='p-3' />
    //       <CardTitle className='pb-2 text-center'>Rick Sanchez</CardTitle>
    //       <View className='flex-row'>
    //         <CardDescription className='text-base font-semibold'>Scientist</CardDescription>
    //         <Tooltip delayDuration={150}>
    //           <TooltipTrigger className='px-2 pb-0.5 active:opacity-50'>
    //             <Info size={14} strokeWidth={2.5} className='w-4 h-4 text-foreground/70' />
    //           </TooltipTrigger>
    //           <TooltipContent className='py-2 px-4 shadow'>
    //             <Text className='native:text-lg'>Freelance</Text>
    //           </TooltipContent>
    //         </Tooltip>
    //       </View>
    //     </CardHeader>
    //     <CardContent>
    //       <View className='flex-row justify-around gap-3'>
    //         <View className='items-center'>
    //           <Text className='text-sm text-muted-foreground'>Dimension</Text>
    //           <Text className='text-xl font-semibold'>C-137</Text>
    //         </View>
    //         <View className='items-center'>
    //           <Text className='text-sm text-muted-foreground'>Age</Text>
    //           <Text className='text-xl font-semibold'>70</Text>
    //         </View>
    //         <View className='items-center'>
    //           <Text className='text-sm text-muted-foreground'>Species</Text>
    //           <Text className='text-xl font-semibold'>Human</Text>
    //         </View>
    //       </View>
    //     </CardContent>
    //     <CardFooter className='flex-col gap-3 pb-0'>
    //       <View className='flex-row items-center overflow-hidden'>
    //         <Text className='text-sm text-muted-foreground'>Productivity:</Text>
    //         <LayoutAnimationConfig skipEntering>
    //           <Animated.View
    //             key={progress}
    //             entering={FadeInUp}
    //             exiting={FadeOutDown}
    //             className='w-11 items-center'
    //           >
    //             <Text className='text-sm font-bold text-sky-600'>{progress}%</Text>
    //           </Animated.View>
    //         </LayoutAnimationConfig>
    //       </View>
    //       <Progress value={progress} className='h-2' indicatorClassName='bg-sky-600' />
    //       <View />
    //       <Button
    //         variant='outline'
    //         className='shadow shadow-foreground/5'
    //         onPress={updateProgressValue}
    //       >
    //         <Text className='text-sm text-teal-600'>Update</Text>
    //       </Button>
    //     </CardFooter>
    //   </Card>
    // </View>
  );
}
