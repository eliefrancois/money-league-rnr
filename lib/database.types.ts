export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bar_partners: {
        Row: {
          id: number
          name: string
          city: string | null
          state: string | null
          logo_url: string | null
          default_incentive: string | null
          created_at: string
        }
        Insert: {
          id?: never
          name: string
          city?: string | null
          state?: string | null
          logo_url?: string | null
          default_incentive?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          name?: string
          city?: string | null
          state?: string | null
          logo_url?: string | null
          default_incentive?: string | null
          created_at?: string
        }
        Relationships: []
      }
      league_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          external_display_name: string | null
          external_user_id: string
          external_username: string | null
          id: string
          is_owner: boolean
          league_id: string
          linked_profile_id: string | null
          payment_status: string
          roster_id: number | null
          team_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          external_display_name?: string | null
          external_user_id: string
          external_username?: string | null
          id?: string
          is_owner?: boolean
          league_id: string
          linked_profile_id?: string | null
          payment_status?: string
          roster_id?: number | null
          team_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          external_display_name?: string | null
          external_user_id?: string
          external_username?: string | null
          id?: string
          is_owner?: boolean
          league_id?: string
          linked_profile_id?: string | null
          payment_status?: string
          roster_id?: number | null
          team_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          authorization_status: string
          authorization_window_closes_at: string | null
          authorization_window_started_at: string | null
          bar_incentive_text: string | null
          bar_partner_id: number | null
          buy_in_cents: number | null
          buyin_configured_at: string | null
          buyin_dispute_open_count: number
          commissioner_external_user_id: string | null
          commissioner_profile_id: string | null
          created_at: string
          external_league_id: string
          fee_payer: string | null
          id: string
          import_metadata: Json
          imported_by: string | null
          name: string
          payout_split: Json | null
          platform: Database["public"]["Enums"]["platform"]
          season: string
          sponsorship_boost_max_cents: number | null
          sponsorship_code_id: number | null
          sponsorship_status: string
          status: string | null
          total_rosters: number | null
          updated_at: string
        }
        Insert: {
          authorization_status?: string
          authorization_window_closes_at?: string | null
          authorization_window_started_at?: string | null
          bar_incentive_text?: string | null
          bar_partner_id?: number | null
          buy_in_cents?: number | null
          buyin_configured_at?: string | null
          buyin_dispute_open_count?: number
          commissioner_external_user_id?: string | null
          commissioner_profile_id?: string | null
          created_at?: string
          external_league_id: string
          fee_payer?: string | null
          id?: string
          import_metadata?: Json
          imported_by?: string | null
          name: string
          payout_split?: Json | null
          platform: Database["public"]["Enums"]["platform"]
          season: string
          sponsorship_boost_max_cents?: number | null
          sponsorship_code_id?: number | null
          sponsorship_status?: string
          status?: string | null
          total_rosters?: number | null
          updated_at?: string
        }
        Update: {
          authorization_status?: string
          authorization_window_closes_at?: string | null
          authorization_window_started_at?: string | null
          bar_incentive_text?: string | null
          bar_partner_id?: number | null
          buy_in_cents?: number | null
          buyin_configured_at?: string | null
          buyin_dispute_open_count?: number
          commissioner_external_user_id?: string | null
          commissioner_profile_id?: string | null
          created_at?: string
          external_league_id?: string
          fee_payer?: string | null
          id?: string
          import_metadata?: Json
          imported_by?: string | null
          name?: string
          payout_split?: Json | null
          platform?: Database["public"]["Enums"]["platform"]
          season?: string
          sponsorship_boost_max_cents?: number | null
          sponsorship_code_id?: number | null
          sponsorship_status?: string
          status?: string | null
          total_rosters?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_commissioner_profile_id_fkey"
            columns: ["commissioner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          
          {
            foreignKeyName: "leagues_bar_partner_id_fkey"
            columns: ["bar_partner_id"]
            isOneToOne: false
            referencedRelation: "bar_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_sponsorship_code_id_fkey"
            columns: ["sponsorship_code_id"]
            isOneToOne: false
            referencedRelation: "sponsorship_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          failed_at: string | null
          failure_reason: string | null
          id: number
          initiated_by: string | null
          league_id: string
          league_member_id: string | null
          paid_at: string | null
          payout_slice: string
          profile_id: string | null
          rank: number | null
          recipient_kind: string
          scheduled_for: string | null
          snapshot_id: number
          status: string
          stripe_destination_account: string | null
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: never
          initiated_by?: string | null
          league_id: string
          league_member_id?: string | null
          paid_at?: string | null
          payout_slice?: string
          profile_id?: string | null
          rank?: number | null
          recipient_kind?: string
          scheduled_for?: string | null
          snapshot_id: number
          status?: string
          stripe_destination_account?: string | null
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: never
          initiated_by?: string | null
          league_id?: string
          league_member_id?: string | null
          paid_at?: string | null
          payout_slice?: string
          profile_id?: string | null
          rank?: number | null
          recipient_kind?: string
          scheduled_for?: string | null
          snapshot_id?: number
          status?: string
          stripe_destination_account?: string | null
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_league_member_id_fkey"
            columns: ["league_member_id"]
            isOneToOne: false
            referencedRelation: "league_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "standings_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsorship_codes: {
        Row: {
          id: number
          code: string
          boost_max_cents: number
          match_ratio: number
          partner_name: string
          partner_contact_email: string | null
          expires_at: string
          conditions: Json
          redeemed_for_league_id: string | null
          redeemed_at: string | null
          funded_at: string | null
          forfeited_at: string | null
          status: string
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: never
          code: string
          boost_max_cents: number
          match_ratio?: number
          partner_name?: string
          partner_contact_email?: string | null
          expires_at: string
          conditions?: Json
          redeemed_for_league_id?: string | null
          redeemed_at?: string | null
          funded_at?: string | null
          forfeited_at?: string | null
          status?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          code?: string
          boost_max_cents?: number
          match_ratio?: number
          partner_name?: string
          partner_contact_email?: string | null
          expires_at?: string
          conditions?: Json
          redeemed_for_league_id?: string | null
          redeemed_at?: string | null
          funded_at?: string | null
          forfeited_at?: string | null
          status?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsorship_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorship_codes_redeemed_for_league_id_fkey"
            columns: ["redeemed_for_league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_identities: {
        Row: {
          avatar_url: string | null
          created_at: string
          external_display_name: string | null
          external_user_id: string
          external_username: string | null
          id: string
          platform: Database["public"]["Enums"]["platform"]
          profile_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          external_display_name?: string | null
          external_user_id: string
          external_username?: string | null
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          profile_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          external_display_name?: string | null
          external_user_id?: string
          external_username?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_identities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pot_ledger: {
        Row: {
          amount_cents: number
          audit_reason: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: number
          league_id: string
          member_id: string | null
          stripe_charge_id: string | null
          stripe_event_id: string | null
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
          type: string
        }
        Insert: {
          amount_cents: number
          audit_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: never
          league_id: string
          member_id?: string | null
          stripe_charge_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          type: string
        }
        Update: {
          amount_cents?: number
          audit_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: never
          league_id?: string
          member_id?: string | null
          stripe_charge_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pot_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pot_ledger_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pot_ledger_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_verified_at: string | null
          avatar_url: string | null
          billing_state: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          geo_status: string
          id: string
          ip_country: string | null
          ip_state: string | null
          is_espn_synced: boolean
          is_sleeper_synced: boolean
          is_yahoo_synced: boolean
          location_state: string | null
          setup_intent_completed_at: string | null
          stripe_account_id: string | null
          stripe_account_updated_at: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          stripe_requirements: Json | null
          updated_at: string
          username: string | null
        }
        Insert: {
          age_verified_at?: string | null
          avatar_url?: string | null
          billing_state?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          geo_status?: string
          id: string
          ip_country?: string | null
          ip_state?: string | null
          is_espn_synced?: boolean
          is_sleeper_synced?: boolean
          is_yahoo_synced?: boolean
          location_state?: string | null
          setup_intent_completed_at?: string | null
          stripe_account_id?: string | null
          stripe_account_updated_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          age_verified_at?: string | null
          avatar_url?: string | null
          billing_state?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          geo_status?: string
          id?: string
          ip_country?: string | null
          ip_state?: string | null
          is_espn_synced?: boolean
          is_sleeper_synced?: boolean
          is_yahoo_synced?: boolean
          location_state?: string | null
          setup_intent_completed_at?: string | null
          stripe_account_id?: string | null
          stripe_account_updated_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      restricted_state_waitlist: {
        Row: {
          created_at: string
          email: string
          id: number
          ip_state: string | null
          notified_at: string | null
          source: string
          state: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: never
          ip_state?: string | null
          notified_at?: string | null
          source?: string
          state: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
          ip_state?: string | null
          notified_at?: string | null
          source?: string
          state?: string
        }
        Relationships: []
      }
      standings_authorizations: {
        Row: {
          created_at: string
          dispute_reason: string | null
          id: number
          league_id: string
          league_member_id: string
          snapshot_id: number
          status: string
          updated_at: string
          voted_at: string | null
        }
        Insert: {
          created_at?: string
          dispute_reason?: string | null
          id?: never
          league_id: string
          league_member_id: string
          snapshot_id: number
          status?: string
          updated_at?: string
          voted_at?: string | null
        }
        Update: {
          created_at?: string
          dispute_reason?: string | null
          id?: never
          league_id?: string
          league_member_id?: string
          snapshot_id?: number
          status?: string
          updated_at?: string
          voted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "standings_authorizations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_authorizations_league_member_id_fkey"
            columns: ["league_member_id"]
            isOneToOne: false
            referencedRelation: "league_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_authorizations_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "standings_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      standings_snapshots: {
        Row: {
          current_week: number | null
          fetched_at: string
          id: number
          is_final: boolean
          league_id: string
          raw_data: Json
          season_status: string | null
          standings: Json
        }
        Insert: {
          current_week?: number | null
          fetched_at?: string
          id?: never
          is_final?: boolean
          league_id: string
          raw_data: Json
          season_status?: string | null
          standings: Json
        }
        Update: {
          current_week?: number | null
          fetched_at?: string
          id?: never
          is_final?: boolean
          league_id?: string
          raw_data?: Json
          season_status?: string | null
          standings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "standings_snapshots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      league_pot_balance: {
        Row: {
          available_cents: number | null
          league_id: string | null
          member_paid_cents: number | null
          reserve_cents: number | null
          sponsorship_credited_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pot_ledger_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      link_member_to_profile: {
        Args: { p_league_member_id: string; p_profile_id: string }
        Returns: undefined
      }
      refresh_league_pot_balance: { Args: never; Returns: undefined }
    }
    Enums: {
      platform: "sleeper" | "espn" | "yahoo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      platform: ["sleeper", "espn", "yahoo"],
    },
  },
} as const
