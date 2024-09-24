// import { View, Pressable } from "react-native";
// import { Card, CardContent } from "./ui/card";
// import { Text } from "./ui/text";
// import { FontAwesome } from "@expo/vector-icons";

// import { LeagueDetails } from "~/app/(app)/league/[leagueId]";

// interface TeamInviteCardProps {
//   data: LeagueDetails;
//   teamId: string;
//   leagueId: string;
// }   

// export const TeamInviteCard: React.FC<TeamInviteCardProps> = ({ data, teamId, leagueId }: TeamInviteCardProps) => {
//   return (
//     <Card className="w-full mb-4">
//       <CardContent className="flex-row items-center justify-between p-4">
//         <View className="flex-1 mr-4">
//           <Text className="text-lg font-bold">{data?.teams[teamId].team_name}</Text>
//           <Text className="text-base text-gray-600">{teamId}</Text>
//         </View>
//         <Pressable>
//           <FontAwesome name="plus" size={24} color="black" />
//         </Pressable>
//       </CardContent>
//     </Card>
//   );
// };

