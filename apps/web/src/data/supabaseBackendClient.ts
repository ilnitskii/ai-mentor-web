import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { BackendClient, SessionUser } from "./backendClient";
import {
  normalizeUsername,
  usernameToAuthEmail,
  validateUsername,
} from "./authIdentity";
import type { BackendServices } from "./backendServices";
import type { Database } from "./database.types";
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
import { IndexedDbOfflineStore } from "./offlineStore";
import { BrowserUserCache, CompositeUserCache } from "./userCache";

export class SupabaseBackendClient implements BackendClient {
  readonly mode = "supabase" as const;

  constructor(private readonly client: SupabaseClient<Database>) {}

  async getCurrentUser(): Promise<SessionUser | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    return user ? this.toSessionUser(user) : null;
  }

  async signIn(username: string, password: string): Promise<SessionUser> {
    const email = await usernameToAuthEmail(username);
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return this.toSessionUser(data.user);
  }

  async signUp(username: string, password: string): Promise<SessionUser> {
    const usernameKey = validateUsername(username);
    const displayName = username.normalize("NFKC").trim().replace(/\s+/g, " ");
    const email = await usernameToAuthEmail(usernameKey);
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, username_key: usernameKey },
      },
    });
    if (error) {
      const message = error.message.toLocaleLowerCase("en-US");
      if (message.includes("already registered"))
        throw new Error("AUTH_USERNAME_TAKEN");
      if (message.includes("password")) throw new Error("AUTH_WEAK_PASSWORD");
      if (message.includes("signup") || error.status === 422)
        throw new Error("AUTH_SIGNUP_DISABLED");
      throw error;
    }
    if (!data.session) throw new Error("AUTH_SIGNUP_CONFIRMATION_REQUIRED");
    if (!data.user) throw new Error("AUTH_SIGNUP_FAILED");
    return this.toSessionUser(data.user);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  onAuthStateChange(listener: (user: SessionUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      listener(user ? this.toSessionUser(user) : null);
    });
    return () => data.subscription.unsubscribe();
  }

  private toSessionUser(user: {
    id: string;
    user_metadata?: { display_name?: unknown; username_key?: unknown };
  }): SessionUser {
    const metadata = user.user_metadata ?? {};
    const username =
      typeof metadata.username_key === "string"
        ? normalizeUsername(metadata.username_key)
        : "ученик";
    const displayName =
      typeof metadata.display_name === "string" && metadata.display_name.trim()
        ? metadata.display_name.trim()
        : username;
    return { id: user.id, username, displayName };
  }
}

export class SupabaseMentorDatabase implements MentorDatabase {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getPublishedCourse(trackId: string) {
    const { data, error } = await this.client
      .from("course_releases")
      .select("*")
      .eq("track_id", trackId)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateProfile(userId: string, update: ProfileUpdate): Promise<Profile> {
    const { data, error } = await this.client
      .from("profiles")
      .update(update)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async listProgressEvents(
    userId: string,
    limit = 100,
  ): Promise<ProgressEvent[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const { data, error } = await this.client
      .from("progress_events")
      .select("*")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    return data;
  }

  async getProgressEvent(
    userId: string,
    eventId: string,
  ): Promise<ProgressEvent | null> {
    const { data, error } = await this.client
      .from("progress_events")
      .select("*")
      .eq("user_id", userId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async appendProgressEvent(
    userId: string,
    event: NewProgressEvent,
  ): Promise<ProgressEvent> {
    const { data, error } = await this.client
      .from("progress_events")
      .insert({ ...event, user_id: userId })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async submitPendingReview(
    userId: string,
    review: PendingReviewInput,
  ): Promise<PendingReview> {
    const { data, error } = await this.client
      .from("pending_reviews")
      .insert({ ...review, user_id: userId })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async getPendingReview(
    userId: string,
    attemptId: string,
  ): Promise<PendingReview | null> {
    const { data, error } = await this.client
      .from("pending_reviews")
      .select("*")
      .eq("user_id", userId)
      .eq("attempt_id", attemptId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async saveProgressProjection(
    userId: string,
    mastery: MasterySnapshotInput[],
    cards: CardStateInput[],
  ): Promise<void> {
    if (mastery.length > 0) {
      const { error } = await this.client.from("mastery_snapshots").upsert(
        mastery.map((snapshot) => ({ ...snapshot, user_id: userId })),
        { onConflict: "user_id,topic_id,algorithm_version" },
      );
      if (error) throw error;
    }
    if (cards.length > 0) {
      const { error } = await this.client.from("card_states").upsert(
        cards.map((card) => ({ ...card, user_id: userId })),
        {
          onConflict: "user_id,card_id,algorithm_version",
        },
      );
      if (error) throw error;
    }
  }
}

export function createSupabaseBackendServices(
  url: string,
  publishableKey: string,
): BackendServices {
  const client = createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  const offline = new IndexedDbOfflineStore();
  return {
    auth: new SupabaseBackendClient(client),
    database: new SupabaseMentorDatabase(client),
    offline,
    userCache: new CompositeUserCache([new BrowserUserCache(), offline]),
  };
}
