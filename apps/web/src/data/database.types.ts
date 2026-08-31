export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      course_releases: {
        Row: {
          track_id: string;
          release_version: number;
          schema_version: 1;
          title: string;
          start_week: number;
          end_week: number;
          content: Json;
          content_sha256: string;
          status: "published" | "archived";
          published_at: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id: string;
          display_name: string;
          username_key: string;
          goal: string;
          level: "beginner" | "junior" | "middle" | "senior";
          learning_role: string;
          language: string;
          timezone: string;
          daily_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string;
          username_key?: string;
          goal?: string;
          level?: "beginner" | "junior" | "middle" | "senior";
          learning_role?: string;
          language?: string;
          timezone?: string;
          daily_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          goal?: string;
          display_name?: string;
          level?: "beginner" | "junior" | "middle" | "senior";
          learning_role?: string;
          language?: string;
          timezone?: string;
          daily_minutes?: number;
        };
        Relationships: [];
      };
      progress_events: {
        Row: {
          event_id: string;
          user_id: string;
          schema_version: number;
          profile_id: string;
          device_id: string;
          item_id: string;
          event_type: string;
          occurred_at: string;
          timezone: string;
          payload: Json;
          received_at: string;
        };
        Insert: {
          event_id: string;
          user_id: string;
          schema_version?: number;
          profile_id?: string;
          device_id: string;
          item_id: string;
          event_type: string;
          occurred_at: string;
          timezone: string;
          payload?: Json;
          received_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      pending_reviews: {
        Row: {
          review_id: string;
          attempt_id: string;
          user_id: string;
          task_id: string;
          answer: string;
          status: "pending_review" | "under_review" | "reviewed";
          submitted_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          review_id: string;
          attempt_id: string;
          user_id: string;
          task_id: string;
          answer: string;
          status?: "pending_review" | "under_review" | "reviewed";
          submitted_at?: string;
          reviewed_at?: string | null;
        };
        Update: {
          status?: "pending_review" | "under_review" | "reviewed";
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      pipeline_runs: {
        Row: {
          run_id: string;
          user_id: string;
          status:
            | "started"
            | "candidate_ready"
            | "published"
            | "failed"
            | "quarantined";
          input_cursor: Json;
          error_code: string | null;
          started_at: string;
          finished_at: string | null;
        };
        Insert: {
          run_id: string;
          user_id: string;
          status:
            | "started"
            | "candidate_ready"
            | "published"
            | "failed"
            | "quarantined";
          input_cursor?: Json;
          error_code?: string | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Update: {
          status?:
            | "started"
            | "candidate_ready"
            | "published"
            | "failed"
            | "quarantined";
          input_cursor?: Json;
          error_code?: string | null;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      mastery_snapshots: {
        Row: {
          user_id: string;
          topic_id: string;
          score: number;
          evidence_count: number;
          recent_accuracy: number | null;
          evidence: Json;
          algorithm_version: "progress-v1";
          as_of: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          topic_id: string;
          score: number;
          evidence_count: number;
          recent_accuracy?: number | null;
          evidence?: Json;
          algorithm_version: "progress-v1";
          as_of: string;
          updated_at?: string;
        };
        Update: {
          score?: number;
          evidence_count?: number;
          recent_accuracy?: number | null;
          evidence?: Json;
          as_of?: string;
        };
        Relationships: [];
      };
      card_states: {
        Row: {
          user_id: string;
          card_id: string;
          due_at: string;
          stability: number;
          difficulty: number;
          last_event_id: string;
          algorithm_version: "progress-v1";
          updated_at: string;
        };
        Insert: {
          user_id: string;
          card_id: string;
          due_at: string;
          stability: number;
          difficulty: number;
          last_event_id: string;
          algorithm_version: "progress-v1";
          updated_at?: string;
        };
        Update: {
          due_at?: string;
          stability?: number;
          difficulty?: number;
          last_event_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
