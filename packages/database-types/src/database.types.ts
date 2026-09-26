/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by `npm run db:types` from the hosted Supabase schema.
 * To change anything here, edit a migration in supabase/migrations/ and rerun.
 */

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
      account_deletion_requests: {
        Row: {
          started_at: string
          user_id: string
        }
        Insert: {
          started_at?: string
          user_id: string
        }
        Update: {
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_storage_deletions: {
        Row: {
          account_id: string
          requested_at: string
          storage_path: string
        }
        Insert: {
          account_id: string
          requested_at?: string
          storage_path: string
        }
        Update: {
          account_id?: string
          requested_at?: string
          storage_path?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string
          id?: never
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          granted_by: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      arrival_intents: {
        Row: {
          cancelled_at: string | null
          created_at: string
          eta_minutes: number
          expires_at: string
          fulfilled_by_check_in_id: string | null
          id: string
          region_id: number
          sport_id: number
          user_id: string
          venue_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          eta_minutes: number
          expires_at: string
          fulfilled_by_check_in_id?: string | null
          id?: string
          region_id: number
          sport_id: number
          user_id: string
          venue_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          eta_minutes?: number
          expires_at?: string
          fulfilled_by_check_in_id?: string | null
          id?: string
          region_id?: number
          sport_id?: number
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arrival_intents_fulfilled_by_check_in_id_fkey"
            columns: ["fulfilled_by_check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_intents_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_intents_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_intents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          created_at: string
          distance_to_venue_m: number | null
          end_reason: Database["public"]["Enums"]["check_in_end_reason"] | null
          ended_at: string | null
          expires_at: string
          id: string
          location_verified: boolean
          note: string | null
          party_size: number
          pulse: Database["public"]["Enums"]["venue_pulse"] | null
          region_id: number
          reported_accuracy_m: number | null
          sport_id: number
          started_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          distance_to_venue_m?: number | null
          end_reason?: Database["public"]["Enums"]["check_in_end_reason"] | null
          ended_at?: string | null
          expires_at: string
          id?: string
          location_verified?: boolean
          note?: string | null
          party_size?: number
          pulse?: Database["public"]["Enums"]["venue_pulse"] | null
          region_id: number
          reported_accuracy_m?: number | null
          sport_id: number
          started_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          distance_to_venue_m?: number | null
          end_reason?: Database["public"]["Enums"]["check_in_end_reason"] | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          location_verified?: boolean
          note?: string | null
          party_size?: number
          pulse?: Database["public"]["Enums"]["venue_pulse"] | null
          region_id?: number
          reported_accuracy_m?: number | null
          sport_id?: number
          started_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          content_snapshot: string | null
          created_at: string
          details: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_kind: Database["public"]["Enums"]["report_target"]
          target_user_id: string
        }
        Insert: {
          content_snapshot?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_kind: Database["public"]["Enums"]["report_target"]
          target_user_id: string
        }
        Update: {
          content_snapshot?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_kind?: Database["public"]["Enums"]["report_target"]
          target_user_id?: string
        }
        Relationships: []
      }
      osm_sport_aliases: {
        Row: {
          alias: string
          created_at: string
          is_ignored: boolean
          note: string | null
          sport_id: number | null
        }
        Insert: {
          alias: string
          created_at?: string
          is_ignored?: boolean
          note?: string | null
          sport_id?: number | null
        }
        Update: {
          alias?: string
          created_at?: string
          is_ignored?: boolean
          note?: string | null
          sport_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "osm_sport_aliases_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_sports: {
        Row: {
          created_at: string
          profile_id: string
          sport_id: number
        }
        Insert: {
          created_at?: string
          profile_id: string
          sport_id: number
        }
        Update: {
          created_at?: string
          profile_id?: string
          sport_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_sports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          home_region_id: number | null
          id: string
          onboarding_completed_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name: string
          home_region_id?: number | null
          id: string
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          home_region_id?: number | null
          id?: string
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_home_region_id_fkey"
            columns: ["home_region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          created_at: string
          id: number
          is_published: boolean
          max_lat: number
          max_lon: number
          min_lat: number
          min_lon: number
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_published?: boolean
          max_lat: number
          max_lon: number
          min_lat: number
          min_lon: number
          name: string
          slug: string
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_published?: boolean
          max_lat?: number
          max_lon?: number
          min_lat?: number
          min_lon?: number
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      run_exceptions: {
        Row: {
          created_at: string
          id: string
          note: string | null
          occurrence_date: string
          replacement_end_at: string | null
          replacement_start_at: string | null
          run_series_id: string
          status: Database["public"]["Enums"]["run_exception_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          occurrence_date: string
          replacement_end_at?: string | null
          replacement_start_at?: string | null
          run_series_id: string
          status: Database["public"]["Enums"]["run_exception_status"]
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          occurrence_date?: string
          replacement_end_at?: string | null
          replacement_start_at?: string | null
          run_series_id?: string
          status?: Database["public"]["Enums"]["run_exception_status"]
        }
        Relationships: [
          {
            foreignKeyName: "run_exceptions_run_series_id_fkey"
            columns: ["run_series_id"]
            isOneToOne: false
            referencedRelation: "run_series"
            referencedColumns: ["id"]
          },
        ]
      }
      run_series: {
        Row: {
          created_at: string
          description: string | null
          expected_players: number | null
          id: string
          latitude: number | null
          local_end_time: string
          local_start_time: string
          location_name: string | null
          longitude: number | null
          organizer_id: string
          region_id: number | null
          sport_id: number
          starts_on: string
          status: Database["public"]["Enums"]["run_series_status"]
          timezone: string
          title: string | null
          updated_at: string
          valid_until: string
          venue_id: string | null
          weekday: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          expected_players?: number | null
          id?: string
          latitude?: number | null
          local_end_time: string
          local_start_time: string
          location_name?: string | null
          longitude?: number | null
          organizer_id: string
          region_id?: number | null
          sport_id: number
          starts_on: string
          status?: Database["public"]["Enums"]["run_series_status"]
          timezone: string
          title?: string | null
          updated_at?: string
          valid_until: string
          venue_id?: string | null
          weekday: number
        }
        Update: {
          created_at?: string
          description?: string | null
          expected_players?: number | null
          id?: string
          latitude?: number | null
          local_end_time?: string
          local_start_time?: string
          location_name?: string | null
          longitude?: number | null
          organizer_id?: string
          region_id?: number | null
          sport_id?: number
          starts_on?: string
          status?: Database["public"]["Enums"]["run_series_status"]
          timezone?: string
          title?: string | null
          updated_at?: string
          valid_until?: string
          venue_id?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "run_series_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_series_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_series_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      run_sessions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          ends_at: string
          id: string
          latitude: number | null
          location_name: string | null
          longitude: number | null
          occurrence_date: string
          region_id: number | null
          run_series_id: string
          sport_id: number
          starts_at: string
          title: string | null
          venue_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          ends_at: string
          id?: string
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          occurrence_date: string
          region_id?: number | null
          run_series_id: string
          sport_id: number
          starts_at: string
          title?: string | null
          venue_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          occurrence_date?: string
          region_id?: number | null
          run_series_id?: string
          sport_id?: number
          starts_at?: string
          title?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "run_sessions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_sessions_run_series_id_fkey"
            columns: ["run_series_id"]
            isOneToOne: false
            referencedRelation: "run_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_sessions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      session_media: {
        Row: {
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["session_media_kind"]
          post_id: string
          remote_url: string | null
          storage_path: string | null
          uploader_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["session_media_kind"]
          post_id: string
          remote_url?: string | null
          storage_path?: string | null
          uploader_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["session_media_kind"]
          post_id?: string
          remote_url?: string | null
          storage_path?: string | null
          uploader_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "session_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      session_memberships: {
        Row: {
          attendance: string
          joined_at: string
          role: Database["public"]["Enums"]["session_member_role"]
          session_id: string
          user_id: string
        }
        Insert: {
          attendance?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["session_member_role"]
          session_id: string
          user_id: string
        }
        Update: {
          attendance?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["session_member_role"]
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_memberships_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "run_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "run_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_posts: {
        Row: {
          author_id: string
          caption: string | null
          created_at: string
          id: string
          location_verified_at: string | null
          session_id: string
        }
        Insert: {
          author_id: string
          caption?: string | null
          created_at?: string
          id?: string
          location_verified_at?: string | null
          session_id: string
        }
        Update: {
          author_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          location_verified_at?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_posts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "run_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      venue_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          source: string
          venue_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          source?: string
          venue_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          source?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_aliases_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_candidate_matches: {
        Row: {
          candidate_id: string
          created_at: string
          distance_m: number
          name_similarity: number
          score: number
          shared_sport_count: number
          venue_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          distance_m: number
          name_similarity: number
          score: number
          shared_sport_count: number
          venue_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          distance_m?: number
          name_similarity?: number
          score?: number
          shared_sport_count?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_candidate_matches_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "venue_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_candidate_matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_candidate_sports: {
        Row: {
          candidate_id: string
          created_at: string
          origin: Database["public"]["Enums"]["venue_candidate_sport_origin"]
          sport_id: number
        }
        Insert: {
          candidate_id: string
          created_at?: string
          origin?: Database["public"]["Enums"]["venue_candidate_sport_origin"]
          sport_id: number
        }
        Update: {
          candidate_id?: string
          created_at?: string
          origin?: Database["public"]["Enums"]["venue_candidate_sport_origin"]
          sport_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_candidate_sports_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "venue_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_candidate_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_candidates: {
        Row: {
          address_text: string | null
          created_at: string
          duplicate_of_venue_id: string | null
          id: string
          indoor_state: Database["public"]["Enums"]["indoor_state"]
          location: unknown
          proposed_name: string
          published_venue_id: string | null
          region_id: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["venue_candidate_status"]
          submitted_by: string
          updated_at: string
        }
        Insert: {
          address_text?: string | null
          created_at?: string
          duplicate_of_venue_id?: string | null
          id?: string
          indoor_state: Database["public"]["Enums"]["indoor_state"]
          location: unknown
          proposed_name: string
          published_venue_id?: string | null
          region_id: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["venue_candidate_status"]
          submitted_by: string
          updated_at?: string
        }
        Update: {
          address_text?: string | null
          created_at?: string
          duplicate_of_venue_id?: string | null
          id?: string
          indoor_state?: Database["public"]["Enums"]["indoor_state"]
          location?: unknown
          proposed_name?: string
          published_venue_id?: string | null
          region_id?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["venue_candidate_status"]
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_candidates_duplicate_of_venue_id_fkey"
            columns: ["duplicate_of_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_candidates_published_venue_id_fkey"
            columns: ["published_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_candidates_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_conditions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          kind: Database["public"]["Enums"]["venue_condition_kind"]
          note: string | null
          reported_by: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          kind: Database["public"]["Enums"]["venue_condition_kind"]
          note?: string | null
          reported_by: string
          venue_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["venue_condition_kind"]
          note?: string | null
          reported_by?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_conditions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_sports: {
        Row: {
          created_at: string
          sport_id: number
          venue_id: string
        }
        Insert: {
          created_at?: string
          sport_id: number
          venue_id: string
        }
        Update: {
          created_at?: string
          sport_id?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_sports_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address_text: string | null
          created_at: string
          created_by: string | null
          id: string
          indoor_state: Database["public"]["Enums"]["indoor_state"]
          location: unknown
          merged_into_venue_id: string | null
          name: string
          region_id: number
          status: Database["public"]["Enums"]["venue_status"]
          updated_at: string
          verification_method: string | null
          verification_state: Database["public"]["Enums"]["verification_state"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          address_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indoor_state?: Database["public"]["Enums"]["indoor_state"]
          location: unknown
          merged_into_venue_id?: string | null
          name: string
          region_id: number
          status?: Database["public"]["Enums"]["venue_status"]
          updated_at?: string
          verification_method?: string | null
          verification_state?: Database["public"]["Enums"]["verification_state"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          address_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indoor_state?: Database["public"]["Enums"]["indoor_state"]
          location?: unknown
          merged_into_venue_id?: string | null
          name?: string
          region_id?: number
          status?: Database["public"]["Enums"]["venue_status"]
          updated_at?: string
          verification_method?: string | null
          verification_state?: Database["public"]["Enums"]["verification_state"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_merged_into_venue_id_fkey"
            columns: ["merged_into_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_accepts_writes: { Args: never; Returns: boolean }
      account_deletion_objects: {
        Args: { p_user_id: string }
        Returns: {
          storage_path: string
        }[]
      }
      ack_account_deletion_objects: {
        Args: { p_paths: string[]; p_user_id: string }
        Returns: undefined
      }
      admin_resolve_reports: {
        Args: {
          p_action: string
          p_note?: string
          p_target_id: string
          p_target_kind: Database["public"]["Enums"]["report_target"]
        }
        Returns: {
          storage_path: string
        }[]
      }
      admin_review_candidate: {
        Args: {
          p_candidate_id: string
          p_decision: string
          p_name?: string
          p_note?: string
          p_target_venue_id?: string
        }
        Returns: string
      }
      admin_update_venue: {
        Args: {
          p_address: string
          p_indoor_state: Database["public"]["Enums"]["indoor_state"]
          p_name: string
          p_sport_ids: number[]
          p_status: Database["public"]["Enums"]["venue_status"]
          p_venue_id: string
          p_verified: boolean
        }
        Returns: undefined
      }
      can_post_to_session: { Args: { p_session_id: string }; Returns: boolean }
      cancel_arrival_intent: {
        Args: { p_intent_id: string }
        Returns: undefined
      }
      cancel_run_session: { Args: { p_session_id: string }; Returns: undefined }
      check_session_photo_location: {
        Args: {
          p_accuracy: number
          p_lat: number
          p_lon: number
          p_observed_at: string
          p_session_id: string
        }
        Returns: undefined
      }
      create_check_in: {
        Args: {
          p_accuracy: number
          p_duration_minutes?: number
          p_lat: number
          p_lon: number
          p_note?: string
          p_observed_at: string
          p_party_size?: number
          p_sport_id: number
          p_venue_id: string
        }
        Returns: string
      }
      create_run: {
        Args: {
          p_end_time: string
          p_sport_id: number
          p_start_time: string
          p_starts_on: string
          p_title: string
          p_venue_id: string
          p_weeks: number
        }
        Returns: string
      }
      create_run_at_pin: {
        Args: {
          p_end_time: string
          p_lat: number
          p_location_name: string
          p_lon: number
          p_sport_id: number
          p_start_time: string
          p_starts_on: string
          p_timezone: string
          p_title: string
          p_weeks: number
        }
        Returns: string
      }
      create_session_photo_post: {
        Args: {
          p_accuracy: number
          p_caption: string
          p_lat: number
          p_lon: number
          p_observed_at: string
          p_session_id: string
        }
        Returns: string
      }
      current_profile: {
        Args: never
        Returns: {
          avatar_path: string | null
          created_at: string
          display_name: string
          home_region_id: number | null
          id: string
          onboarding_completed_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_run_session: {
        Args: {
          p_date: string
          p_end_time: string
          p_lat?: number
          p_location_name?: string
          p_lon?: number
          p_session_id: string
          p_start_time: string
          p_timezone: string
          p_title: string
        }
        Returns: undefined
      }
      end_check_in: { Args: { p_check_in_id: string }; Returns: undefined }
      extend_check_in: {
        Args: { p_check_in_id: string; p_minutes?: number }
        Returns: string
      }
      find_duplicate_candidates: {
        Args: {
          p_exclude_venue_id?: string
          p_lat: number
          p_lon: number
          p_name?: string
          p_radius_m?: number
          p_sport_ids?: number[]
        }
        Returns: {
          distance_m: number
          name: string
          name_similarity: number
          score: number
          shared_sport_count: number
          venue_id: string
        }[]
      }
      is_admin: { Args: { p_user_id?: string }; Returns: boolean }
      is_blocked_by_viewer: { Args: { p_user_id: string }; Returns: boolean }
      is_session_member: { Args: { p_session_id: string }; Returns: boolean }
      join_run_session: {
        Args: { p_occurrence_date: string; p_run_series_id: string }
        Returns: string
      }
      leave_run_session: { Args: { p_session_id: string }; Returns: undefined }
      lock_session_media_upload: { Args: { p_path: string }; Returns: boolean }
      nearby_venues: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lon: number
          p_radius_m?: number
          p_sport_ids?: number[]
        }
        Returns: {
          condition_kinds: Database["public"]["Enums"]["venue_condition_kind"][]
          distance_m: number
          heading_there: number
          here_now: number
          indoor_state: Database["public"]["Enums"]["indoor_state"]
          last_activity_at: string
          latitude: number
          longitude: number
          name: string
          next_run_at: string
          party_count: number
          pulse: Database["public"]["Enums"]["venue_pulse"]
          sport_names: string[]
          sport_slugs: string[]
          venue_id: string
          verification_state: Database["public"]["Enums"]["verification_state"]
        }[]
      }
      prepare_account_deletion: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      report_content: {
        Args: {
          p_details?: string
          p_reason: Database["public"]["Enums"]["report_reason"]
          p_target_id: string
          p_target_kind: Database["public"]["Enums"]["report_target"]
        }
        Returns: string
      }
      run_attendance: {
        Args: { p_series_ids: string[] }
        Returns: {
          going_count: number
          maybe_count: number
          my_response: string
          occurrence_date: string
          run_series_id: string
          session_id: string
        }[]
      }
      set_arrival_intent: {
        Args: { p_eta_minutes?: number; p_sport_id: number; p_venue_id: string }
        Returns: string
      }
      set_run_attendance: {
        Args: {
          p_attendance: string
          p_occurrence_date: string
          p_run_series_id: string
        }
        Returns: string
      }
      submit_venue: {
        Args: {
          p_address_text?: string
          p_indoor_state: Database["public"]["Enums"]["indoor_state"]
          p_lat: number
          p_lon: number
          p_name: string
          p_sport_ids: number[]
        }
        Returns: {
          candidate_id: string
          status: Database["public"]["Enums"]["venue_candidate_status"]
        }[]
      }
      upcoming_runs: {
        Args: {
          p_days?: number
          p_from?: string
          p_region_id?: number
          p_sport_ids?: number[]
          p_venue_id?: string
        }
        Returns: {
          description: string
          ends_at: string
          expected_players: number
          indoor_state: Database["public"]["Enums"]["indoor_state"]
          is_rescheduled: boolean
          latitude: number
          longitude: number
          occurrence_date: string
          organizer_id: string
          organizer_name: string
          run_series_id: string
          sport_id: number
          sport_name: string
          sport_slug: string
          starts_at: string
          title: string
          valid_until: string
          venue_id: string
          venue_name: string
        }[]
      }
      update_own_profile: {
        Args: {
          p_complete_onboarding?: boolean
          p_display_name: string
          p_sport_ids: number[]
        }
        Returns: {
          avatar_path: string | null
          created_at: string
          display_name: string
          home_region_id: number | null
          id: string
          onboarding_completed_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      venue_activity: {
        Args: { p_venue_id: string }
        Returns: {
          avatar_path: string
          display_name: string
          expires_at: string
          kind: string
          note: string
          party_size: number
          pulse: Database["public"]["Enums"]["venue_pulse"]
          sport_slug: string
          started_at: string
        }[]
      }
      venue_details: {
        Args: { p_venue_id: string }
        Returns: {
          address_text: string
          aliases: string[]
          canonical_id: string
          heading_there: number
          here_now: number
          indoor_state: Database["public"]["Enums"]["indoor_state"]
          last_activity_at: string
          latitude: number
          longitude: number
          name: string
          party_count: number
          pulse: Database["public"]["Enums"]["venue_pulse"]
          region_slug: string
          sport_ids: number[]
          sport_names: string[]
          sport_slugs: string[]
          venue_id: string
          verification_state: Database["public"]["Enums"]["verification_state"]
          was_merged: boolean
        }[]
      }
    }
    Enums: {
      check_in_end_reason: "checkout" | "expired" | "replaced" | "admin"
      indoor_state: "indoor" | "outdoor" | "unknown"
      report_reason:
        | "spam"
        | "harassment"
        | "hate"
        | "sexual_content"
        | "violence"
        | "self_harm"
        | "illegal"
        | "impersonation"
        | "other"
      report_status: "open" | "actioned" | "dismissed"
      report_target:
        | "session_post"
        | "session_message"
        | "run_session"
        | "profile"
      run_exception_status: "cancelled" | "rescheduled"
      run_series_status: "active" | "inactive" | "removed"
      session_media_kind: "image" | "video"
      session_member_role: "organizer" | "player"
      venue_candidate_sport_origin: "submitted" | "reviewer"
      venue_candidate_status:
        | "pending"
        | "possible_duplicate"
        | "approved"
        | "merged"
        | "rejected"
      venue_condition_kind:
        | "lights_on"
        | "lights_off"
        | "wet_surface"
        | "locked"
        | "crowded"
        | "equipment_issue"
      venue_pulse: "need_players" | "game_on" | "full_next_game" | "wrapping_up"
      venue_status: "active" | "merged" | "removed"
      verification_state: "unverified" | "admin_verified" | "community_verified"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      check_in_end_reason: ["checkout", "expired", "replaced", "admin"],
      indoor_state: ["indoor", "outdoor", "unknown"],
      report_reason: [
        "spam",
        "harassment",
        "hate",
        "sexual_content",
        "violence",
        "self_harm",
        "illegal",
        "impersonation",
        "other",
      ],
      report_status: ["open", "actioned", "dismissed"],
      report_target: [
        "session_post",
        "session_message",
        "run_session",
        "profile",
      ],
      run_exception_status: ["cancelled", "rescheduled"],
      run_series_status: ["active", "inactive", "removed"],
      session_media_kind: ["image", "video"],
      session_member_role: ["organizer", "player"],
      venue_candidate_sport_origin: ["submitted", "reviewer"],
      venue_candidate_status: [
        "pending",
        "possible_duplicate",
        "approved",
        "merged",
        "rejected",
      ],
      venue_condition_kind: [
        "lights_on",
        "lights_off",
        "wet_surface",
        "locked",
        "crowded",
        "equipment_issue",
      ],
      venue_pulse: ["need_players", "game_on", "full_next_game", "wrapping_up"],
      venue_status: ["active", "merged", "removed"],
      verification_state: [
        "unverified",
        "admin_verified",
        "community_verified",
      ],
    },
  },
} as const
