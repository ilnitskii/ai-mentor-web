import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { Json } from "./database.types";
import type { NewProgressEvent, PendingReviewInput } from "./mentorDatabase";
import type { UserCache } from "./userCache";

export interface OutboxRecord {
  event: NewProgressEvent;
  userId: string;
  status: "pending" | "conflict";
  createdAt: string;
  errorCode: "EVENT_CONFLICT" | null;
}

export interface PendingReviewOutboxRecord {
  review: PendingReviewInput;
  userId: string;
  status: "pending" | "conflict";
  createdAt: string;
  errorCode: "EVENT_CONFLICT" | null;
}

export class LocalEventConflictError extends Error {
  readonly code = "EVENT_CONFLICT";

  constructor() {
    super("EVENT_CONFLICT");
  }
}

export interface OfflineStore extends UserCache {
  commitProgress(
    userId: string,
    event: NewProgressEvent,
    sessionState: Json,
    pendingReview?: PendingReviewInput,
  ): Promise<void>;
  saveSession(userId: string, sessionState: Json): Promise<void>;
  loadSession(userId: string): Promise<Json | null>;
  listPending(userId: string): Promise<OutboxRecord[]>;
  getOutboxRecord(eventId: string): Promise<OutboxRecord | null>;
  listPendingReviews(userId: string): Promise<PendingReviewOutboxRecord[]>;
  markReviewDelivered(attemptId: string): Promise<void>;
  markReviewConflict(attemptId: string): Promise<void>;
  markDelivered(eventId: string): Promise<void>;
  markConflict(eventId: string): Promise<void>;
  pendingCount(userId: string): Promise<number>;
  putContent(key: string, value: Json): Promise<void>;
  getContent(key: string): Promise<Json | null>;
}

interface MentorOfflineDb extends DBSchema {
  outbox: {
    key: string;
    value: OutboxRecord;
    indexes: { by_user: string };
  };
  sessions: {
    key: string;
    value: { userId: string; state: Json; updatedAt: string };
  };
  content: {
    key: string;
    value: { key: string; value: Json; cachedAt: string };
  };
  reviewOutbox: {
    key: string;
    value: PendingReviewOutboxRecord;
    indexes: { by_user: string };
  };
}

function eventSignature(event: NewProgressEvent): string {
  return JSON.stringify({
    schema_version: event.schema_version,
    event_id: event.event_id,
    profile_id: event.profile_id,
    device_id: event.device_id,
    item_id: event.item_id,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    timezone: event.timezone,
    payload: event.payload,
  });
}

function reviewSignature(review: PendingReviewInput): string {
  return JSON.stringify(review);
}

export class IndexedDbOfflineStore implements OfflineStore {
  private databasePromise: Promise<IDBPDatabase<MentorOfflineDb>> | null = null;

  constructor(private readonly databaseName = "ai-mentor-v1") {}

  private database() {
    this.databasePromise ??= openDB<MentorOfflineDb>(this.databaseName, 2, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const outbox = database.createObjectStore("outbox", {
            keyPath: "event.event_id",
          });
          outbox.createIndex("by_user", "userId");
          database.createObjectStore("sessions", { keyPath: "userId" });
          database.createObjectStore("content", { keyPath: "key" });
        }
        if (oldVersion < 2) {
          const reviews = database.createObjectStore("reviewOutbox", {
            keyPath: "review.attempt_id",
          });
          reviews.createIndex("by_user", "userId");
        }
      },
    });
    return this.databasePromise;
  }

  async commitProgress(
    userId: string,
    event: NewProgressEvent,
    sessionState: Json,
    pendingReview?: PendingReviewInput,
  ): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(
      ["outbox", "sessions", "reviewOutbox"],
      "readwrite",
    );
    const existing = await transaction
      .objectStore("outbox")
      .get(event.event_id);
    if (existing && eventSignature(existing.event) !== eventSignature(event)) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      throw new LocalEventConflictError();
    }
    if (pendingReview) {
      const existingReview = await transaction
        .objectStore("reviewOutbox")
        .get(pendingReview.attempt_id);
      if (
        existingReview &&
        reviewSignature(existingReview.review) !==
          reviewSignature(pendingReview)
      ) {
        transaction.abort();
        await transaction.done.catch(() => undefined);
        throw new LocalEventConflictError();
      }
      if (!existingReview) {
        await transaction.objectStore("reviewOutbox").add({
          review: pendingReview,
          userId,
          status: "pending",
          createdAt: new Date().toISOString(),
          errorCode: null,
        });
      }
    }
    if (!existing) {
      await transaction.objectStore("outbox").add({
        event,
        userId,
        status: "pending",
        createdAt: new Date().toISOString(),
        errorCode: null,
      });
    }
    await transaction.objectStore("sessions").put({
      userId,
      state: sessionState,
      updatedAt: new Date().toISOString(),
    });
    await transaction.done;
  }

  async saveSession(userId: string, sessionState: Json): Promise<void> {
    const database = await this.database();
    await database.put("sessions", {
      userId,
      state: sessionState,
      updatedAt: new Date().toISOString(),
    });
  }

  async loadSession(userId: string): Promise<Json | null> {
    const database = await this.database();
    return (await database.get("sessions", userId))?.state ?? null;
  }

  async listPending(userId: string): Promise<OutboxRecord[]> {
    const database = await this.database();
    const records = await database.getAllFromIndex("outbox", "by_user", userId);
    return records
      .filter((record) => record.status === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getOutboxRecord(eventId: string): Promise<OutboxRecord | null> {
    const database = await this.database();
    return (await database.get("outbox", eventId)) ?? null;
  }

  async listPendingReviews(
    userId: string,
  ): Promise<PendingReviewOutboxRecord[]> {
    const database = await this.database();
    const records = await database.getAllFromIndex(
      "reviewOutbox",
      "by_user",
      userId,
    );
    return records
      .filter((record) => record.status === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async markReviewDelivered(attemptId: string): Promise<void> {
    const database = await this.database();
    await database.delete("reviewOutbox", attemptId);
  }

  async markReviewConflict(attemptId: string): Promise<void> {
    const database = await this.database();
    const record = await database.get("reviewOutbox", attemptId);
    if (!record) return;
    await database.put("reviewOutbox", {
      ...record,
      status: "conflict",
      errorCode: "EVENT_CONFLICT",
    });
  }

  async markDelivered(eventId: string): Promise<void> {
    const database = await this.database();
    await database.delete("outbox", eventId);
  }

  async markConflict(eventId: string): Promise<void> {
    const database = await this.database();
    const record = await database.get("outbox", eventId);
    if (!record) return;
    await database.put("outbox", {
      ...record,
      status: "conflict",
      errorCode: "EVENT_CONFLICT",
    });
  }

  async pendingCount(userId: string): Promise<number> {
    return (await this.listPending(userId)).length;
  }

  async putContent(key: string, value: Json): Promise<void> {
    const database = await this.database();
    await database.put("content", {
      key,
      value,
      cachedAt: new Date().toISOString(),
    });
  }

  async getContent(key: string): Promise<Json | null> {
    const database = await this.database();
    return (await database.get("content", key))?.value ?? null;
  }

  async clearUserData(userId: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(
      ["outbox", "sessions", "reviewOutbox"],
      "readwrite",
    );
    const records = await transaction
      .objectStore("outbox")
      .index("by_user")
      .getAll(userId);
    await Promise.all(
      records.map((record) =>
        transaction.objectStore("outbox").delete(record.event.event_id),
      ),
    );
    await transaction.objectStore("sessions").delete(userId);
    const reviews = await transaction
      .objectStore("reviewOutbox")
      .index("by_user")
      .getAll(userId);
    await Promise.all(
      reviews.map((record) =>
        transaction
          .objectStore("reviewOutbox")
          .delete(record.review.attempt_id),
      ),
    );
    await transaction.done;
  }
}

export class MemoryOfflineStore implements OfflineStore {
  private readonly outbox = new Map<string, OutboxRecord>();
  private readonly sessions = new Map<string, Json>();
  private readonly content = new Map<string, Json>();
  private readonly reviewOutbox = new Map<string, PendingReviewOutboxRecord>();

  async commitProgress(
    userId: string,
    event: NewProgressEvent,
    sessionState: Json,
    pendingReview?: PendingReviewInput,
  ): Promise<void> {
    const existing = this.outbox.get(event.event_id);
    if (existing && eventSignature(existing.event) !== eventSignature(event))
      throw new LocalEventConflictError();
    const existingReview = pendingReview
      ? this.reviewOutbox.get(pendingReview.attempt_id)
      : undefined;
    if (
      pendingReview &&
      existingReview &&
      reviewSignature(existingReview.review) !== reviewSignature(pendingReview)
    )
      throw new LocalEventConflictError();

    this.outbox.set(
      event.event_id,
      existing ?? {
        event,
        userId,
        status: "pending",
        createdAt: new Date().toISOString(),
        errorCode: null,
      },
    );
    if (pendingReview) {
      this.reviewOutbox.set(
        pendingReview.attempt_id,
        existingReview ?? {
          review: pendingReview,
          userId,
          status: "pending",
          createdAt: new Date().toISOString(),
          errorCode: null,
        },
      );
    }
    this.sessions.set(userId, sessionState);
  }

  async saveSession(userId: string, sessionState: Json): Promise<void> {
    this.sessions.set(userId, sessionState);
  }

  async loadSession(userId: string): Promise<Json | null> {
    return this.sessions.get(userId) ?? null;
  }

  async listPending(userId: string): Promise<OutboxRecord[]> {
    return [...this.outbox.values()].filter(
      (record) => record.userId === userId && record.status === "pending",
    );
  }

  async getOutboxRecord(eventId: string): Promise<OutboxRecord | null> {
    return this.outbox.get(eventId) ?? null;
  }

  async listPendingReviews(
    userId: string,
  ): Promise<PendingReviewOutboxRecord[]> {
    return [...this.reviewOutbox.values()].filter(
      (record) => record.userId === userId && record.status === "pending",
    );
  }

  async markReviewDelivered(attemptId: string): Promise<void> {
    this.reviewOutbox.delete(attemptId);
  }

  async markReviewConflict(attemptId: string): Promise<void> {
    const record = this.reviewOutbox.get(attemptId);
    if (record)
      this.reviewOutbox.set(attemptId, {
        ...record,
        status: "conflict",
        errorCode: "EVENT_CONFLICT",
      });
  }

  async markDelivered(eventId: string): Promise<void> {
    this.outbox.delete(eventId);
  }

  async markConflict(eventId: string): Promise<void> {
    const record = this.outbox.get(eventId);
    if (record)
      this.outbox.set(eventId, {
        ...record,
        status: "conflict",
        errorCode: "EVENT_CONFLICT",
      });
  }

  async pendingCount(userId: string): Promise<number> {
    return (await this.listPending(userId)).length;
  }

  async putContent(key: string, value: Json): Promise<void> {
    this.content.set(key, value);
  }

  async getContent(key: string): Promise<Json | null> {
    return this.content.get(key) ?? null;
  }

  async clearUserData(userId: string): Promise<void> {
    for (const [eventId, record] of this.outbox) {
      if (record.userId === userId) this.outbox.delete(eventId);
    }
    for (const [attemptId, record] of this.reviewOutbox) {
      if (record.userId === userId) this.reviewOutbox.delete(attemptId);
    }
    this.sessions.delete(userId);
  }
}
