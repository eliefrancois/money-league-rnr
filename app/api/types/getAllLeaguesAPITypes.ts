
// Picked data types from fan.api.espn.com/apis/v2/fans (used to parse data from Flask API and use in app)
export interface UserLeaguesData {
  leagues: { [leagueId: number]: League };
  profile: UserProfile;

}

export interface League {
  teamName: string;
  teamAbbrev: string;
  active?: boolean;
  draftComplete?: boolean;
  draftInProgress?: boolean;
  inSeason: boolean;
  isLive: boolean;
  currentScoringPeriodId: number;
  teamId: number;
  teamWins: number;
  teamLosses: number;
  teamTies: number;
  teamRank: number;
  teamPoints: number;
  teamLogo: string;
  leagueManager: boolean;
  seasonId: number;
  leagueName: string;
}

export interface UserProfile {
  lastName: string;
  firstName: string;
  email: string;
  userName: string;
  swid: string;
}

// Raw data types from fan.api.espn.com/apis/v2/fans (used for type safety when fetching data from Flask API)
export interface RawUserLeaguesData {
  id: string;
  anon: boolean;
  profile: Profile;
  lastAccessDate: string;
  createDate: string;
  lastUpdateDate: string;
  createSource: null;
  lastUpdateSource: string;
  lastAccessSource: string;
  preferences: RawPreference[];
}

export interface Profile {
  lastName: string;
  firstName: string;
  email: string;
  userName: string;
}

export interface RawPreference {
  id: string;
  metaData: {
    entry: {
      gameId: number;
      wins?: number;
      losses?: number;
      ties?: number;
      rank?: number;
      points?: number;
      logoUrl: string;
      entryId: number;
      seasonId: number;
      entryMetadata: {
        teamName: string;
        teamAbbrev: string;
        active: boolean;
        draftComplete: boolean;
        draftInProgress: boolean;
      };
      groups: {
        groupId: number;
        groupName: string;
        groupManager: boolean;
      }[];
    };
    inSeason: boolean;
    isLive: boolean;
    currentScoringPeriodId: number;
  };
}