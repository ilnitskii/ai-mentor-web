import type { BackendClient, SessionUser } from "./backendClient";
import { normalizeUsername, validateUsername } from "./authIdentity";
import type { BackendServices } from "./backendServices";
import type {
  CardStateInput,
  MasterySnapshotInput,
  MentorDatabase,
  NewProgressEvent,
  PendingReview,
  PendingReviewInput,
  Profile,
  ProfileUpdate,
  ProgressEvent,
} from "./mentorDatabase";
import { MemoryOfflineStore, type OfflineStore } from "./offlineStore";
import {
  BrowserUserCache,
  CompositeUserCache,
  type UserCache,
} from "./userCache";

export class FakeBackendClient implements BackendClient {
  readonly mode = "fake" as const;
  private user: SessionUser | null;
  private readonly listeners = new Set<(user: SessionUser | null) => void>();

  constructor(user: SessionUser | null = null) {
    this.user = user;
  }

  async getCurrentUser(): Promise<SessionUser | null> {
    return this.user;
  }

  async signIn(username: string, _password: string): Promise<SessionUser> {
    void _password;
    this.user = this.createUser(username);
    this.listeners.forEach((listener) => listener(this.user));
    return this.user;
  }

  async signUp(username: string, _password: string): Promise<SessionUser> {
    return this.signIn(username, _password);
  }

  async signOut(): Promise<void> {
    this.user = null;
    this.listeners.forEach((listener) => listener(null));
  }

  onAuthStateChange(listener: (user: SessionUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private createUser(value: string): SessionUser {
    const username = validateUsername(value);
    return {
      id: `local-demo-${encodeURIComponent(username)}`,
      username: normalizeUsername(username),
      displayName: value.normalize("NFKC").trim().replace(/\s+/g, " "),
    };
  }
}

export class FakeMentorDatabase implements MentorDatabase {
  private readonly profiles = new Map<string, Profile>();
  private readonly events: ProgressEvent[] = [];
  private readonly pendingReviews: PendingReview[] = [];
  private readonly masterySnapshots = new Map<string, MasterySnapshotInput>();
  private readonly cardStates = new Map<string, CardStateInput>();

  async getPublishedCourse(_trackId: string) {
    void _trackId;
    return null;
  }

  async getProfile(userId: string): Promise<Profile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async updateProfile(userId: string, update: ProfileUpdate): Promise<Profile> {
    const current = this.profiles.get(userId);
    if (!current) throw new Error("PROFILE_NOT_FOUND");
    const next = {
      ...current,
      ...update,
      updated_at: new Date().toISOString(),
    };
    this.profiles.set(userId, next);
    return next;
  }

  async listProgressEvents(
    userId: string,
    limit = 100,
  ): Promise<ProgressEvent[]> {
    return this.events
      .filter((event) => event.user_id === userId)
      .slice(0, limit);
  }

  async getProgressEvent(
    userId: string,
    eventId: string,
  ): Promise<ProgressEvent | null> {
    return (
      this.events.find(
        (event) => event.user_id === userId && event.event_id === eventId,
      ) ?? null
    );
  }

  async appendProgressEvent(
    userId: string,
    event: NewProgressEvent,
  ): Promise<ProgressEvent> {
    if (this.events.some((candidate) => candidate.event_id === event.event_id))
      throw new Error("EVENT_CONFLICT");
    const stored: ProgressEvent = {
      ...event,
      user_id: userId,
      received_at: new Date().toISOString(),
    };
    this.events.push(stored);
    return stored;
  }

  async submitPendingReview(
    userId: string,
    review: PendingReviewInput,
  ): Promise<PendingReview> {
    if (
      this.pendingReviews.some(
        (candidate) => candidate.attempt_id === review.attempt_id,
      )
    )
      throw new Error("REVIEW_CONFLICT");
    const stored: PendingReview = {
      ...review,
      user_id: userId,
      status: "pending_review",
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
    };
    this.pendingReviews.push(stored);
    return stored;
  }

  async getPendingReview(
    userId: string,
    attemptId: string,
  ): Promise<PendingReview | null> {
    return (
      this.pendingReviews.find(
        (review) =>
          review.user_id === userId && review.attempt_id === attemptId,
      ) ?? null
    );
  }

  async saveProgressProjection(
    userId: string,
    mastery: MasterySnapshotInput[],
    cards: CardStateInput[],
  ): Promise<void> {
    for (const snapshot of mastery)
      this.masterySnapshots.set(
        `${userId}:${snapshot.topic_id}:${snapshot.algorithm_version}`,
        snapshot,
      );
    for (const card of cards)
      this.cardStates.set(
        `${userId}:${card.card_id}:${card.algorithm_version}`,
        card,
      );
  }
}

export function createFakeBackendServices(
  user: SessionUser | null = null,
  userCache: UserCache = new BrowserUserCache(),
  offline: OfflineStore = new MemoryOfflineStore(),
): BackendServices {
  return {
    auth: new FakeBackendClient(user),
    database: new FakeMentorDatabase(),
    offline,
    userCache: new CompositeUserCache([userCache, offline]),
  };
}
