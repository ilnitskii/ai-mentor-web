import type { Database, Json } from "./database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type ProgressEvent =
  Database["public"]["Tables"]["progress_events"]["Row"];
export type PendingReview =
  Database["public"]["Tables"]["pending_reviews"]["Row"];
export type MasterySnapshot =
  Database["public"]["Tables"]["mastery_snapshots"]["Row"];
export type CardState = Database["public"]["Tables"]["card_states"]["Row"];
export type CourseRelease =
  Database["public"]["Tables"]["course_releases"]["Row"];

export interface NewProgressEvent {
  event_id: string;
  schema_version: 1;
  profile_id: string;
  device_id: string;
  item_id: string;
  event_type: string;
  occurred_at: string;
  timezone: string;
  payload: Json;
}

export interface MentorDatabase {
  getPublishedCourse(trackId: string): Promise<CourseRelease | null>;
  getProfile(userId: string): Promise<Profile | null>;
  updateProfile(userId: string, update: ProfileUpdate): Promise<Profile>;
  listProgressEvents(userId: string, limit?: number): Promise<ProgressEvent[]>;
  getProgressEvent(
    userId: string,
    eventId: string,
  ): Promise<ProgressEvent | null>;
  appendProgressEvent(
    userId: string,
    event: NewProgressEvent,
  ): Promise<ProgressEvent>;
  submitPendingReview(
    userId: string,
    review: PendingReviewInput,
  ): Promise<PendingReview>;
  getPendingReview(
    userId: string,
    attemptId: string,
  ): Promise<PendingReview | null>;
  saveProgressProjection(
    userId: string,
    mastery: MasterySnapshotInput[],
    cards: CardStateInput[],
  ): Promise<void>;
}

export interface PendingReviewInput {
  review_id: string;
  attempt_id: string;
  task_id: string;
  answer: string;
}

export type MasterySnapshotInput = Omit<
  Database["public"]["Tables"]["mastery_snapshots"]["Insert"],
  "user_id"
>;

export type CardStateInput = Omit<
  Database["public"]["Tables"]["card_states"]["Insert"],
  "user_id"
>;
