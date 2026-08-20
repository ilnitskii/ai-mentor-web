import { FakeMentorDatabase } from "./fakeBackendClient";
import type { NewProgressEvent } from "./mentorDatabase";
import { MemoryOfflineStore } from "./offlineStore";
import { EventConflictError, SyncEngine } from "./syncEngine";

const event = (correct = true): NewProgressEvent => ({
  event_id: "22000000-0000-4000-8000-000000000002",
  schema_version: 1,
  profile_id: "default",
  device_id: "synthetic-device",
  item_id: "foundations.data-tables.task-choice",
  event_type: "task_submitted",
  occurred_at: "2026-08-18T08:00:00.000Z",
  timezone: "UTC",
  payload: { correct },
});

describe("SyncEngine", () => {
  it("keeps an event through an offline failure and delivers it once on retry", async () => {
    class FlakyDatabase extends FakeMentorDatabase {
      offline = true;

      override async appendProgressEvent(
        userId: string,
        progressEvent: NewProgressEvent,
      ) {
        if (this.offline) throw new Error("NETWORK_UNAVAILABLE");
        return super.appendProgressEvent(userId, progressEvent);
      }
    }

    const database = new FlakyDatabase();
    const offline = new MemoryOfflineStore();
    const engine = new SyncEngine(database, offline);
    await offline.commitProgress("alice", event(), { stage: "summary" });

    await expect(engine.sync("alice")).rejects.toThrow("NETWORK_UNAVAILABLE");
    await expect(offline.pendingCount("alice")).resolves.toBe(1);

    database.offline = false;
    await expect(engine.sync("alice")).resolves.toEqual({ delivered: 1 });
    await expect(engine.sync("alice")).resolves.toEqual({ delivered: 0 });
    await expect(database.listProgressEvents("alice")).resolves.toHaveLength(1);
    await expect(offline.pendingCount("alice")).resolves.toBe(0);
  });

  it("accepts an identical remote event as an idempotent delivery", async () => {
    const database = new FakeMentorDatabase();
    const offline = new MemoryOfflineStore();
    await offline.commitProgress("alice", event(), { stage: "summary" });
    await database.appendProgressEvent("alice", event());

    await expect(
      new SyncEngine(database, offline).sync("alice"),
    ).resolves.toEqual({ delivered: 1 });
    await expect(offline.pendingCount("alice")).resolves.toBe(0);
  });

  it("delivers an offline free answer through the pending-review outbox", async () => {
    const database = new FakeMentorDatabase();
    const offline = new MemoryOfflineStore();
    const review = {
      review_id: "33000000-0000-4000-8000-000000000003",
      attempt_id: "33000000-0000-4000-8000-000000000004",
      task_id: "foundations.data-tables.task-text",
      answer: "Synthetic offline answer",
    };
    await offline.commitProgress(
      "alice",
      event(),
      { stage: "summary" },
      review,
    );

    await new SyncEngine(database, offline).sync("alice");

    await expect(
      database.getPendingReview("alice", review.attempt_id),
    ).resolves.toMatchObject({ answer: review.answer });
    await expect(offline.listPendingReviews("alice")).resolves.toEqual([]);
  });

  it("stops and preserves a conflicting event without overwriting remote data", async () => {
    const database = new FakeMentorDatabase();
    const offline = new MemoryOfflineStore();
    await offline.commitProgress("alice", event(), { stage: "summary" });
    await database.appendProgressEvent("alice", event(false));

    await expect(
      new SyncEngine(database, offline).sync("alice"),
    ).rejects.toBeInstanceOf(EventConflictError);
    await expect(
      offline.getOutboxRecord(event().event_id),
    ).resolves.toMatchObject({
      status: "conflict",
      errorCode: "EVENT_CONFLICT",
    });
    await expect(
      database.getProgressEvent("alice", event().event_id),
    ).resolves.toMatchObject({ payload: { correct: false } });
  });
});
