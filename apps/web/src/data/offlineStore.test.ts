import "fake-indexeddb/auto";

import type { Json } from "./database.types";
import type { NewProgressEvent } from "./mentorDatabase";
import { IndexedDbOfflineStore, LocalEventConflictError } from "./offlineStore";

const event = (payload: Json = { correct: true }): NewProgressEvent => ({
  event_id: "11000000-0000-4000-8000-000000000001",
  schema_version: 1,
  profile_id: "default",
  device_id: "synthetic-device",
  item_id: "foundations.data-tables.lesson",
  event_type: "lesson_completed",
  occurred_at: "2026-08-18T08:00:00.000Z",
  timezone: "UTC",
  payload,
});

describe("IndexedDbOfflineStore", () => {
  it("atomically persists an event and the resumable session", async () => {
    const store = new IndexedDbOfflineStore(`test-${crypto.randomUUID()}`);
    const state = { stage: "cards", cardIndex: 0 };

    await store.commitProgress("alice", event(), state);

    await expect(store.loadSession("alice")).resolves.toEqual(state);
    await expect(store.pendingCount("alice")).resolves.toBe(1);
    await expect(store.listPending("bob")).resolves.toEqual([]);
  });

  it("keeps a free answer in the same local commit without event payload leakage", async () => {
    const store = new IndexedDbOfflineStore(`test-${crypto.randomUUID()}`);
    const review = {
      review_id: "33000000-0000-4000-8000-000000000003",
      attempt_id: "33000000-0000-4000-8000-000000000004",
      task_id: "foundations.data-tables.task-text",
      answer: "Synthetic offline answer",
    };

    await store.commitProgress(
      "alice",
      event({ review_status: "pending_review" }),
      { stage: "summary" },
      review,
    );

    await expect(store.listPendingReviews("alice")).resolves.toMatchObject([
      { review },
    ]);
    const outboxRecord = await store.getOutboxRecord(event().event_id);
    expect(JSON.stringify(outboxRecord?.event.payload)).not.toContain(
      review.answer,
    );
  });

  it("is idempotent for the same payload and rejects an event-id collision", async () => {
    const store = new IndexedDbOfflineStore(`test-${crypto.randomUUID()}`);
    await store.commitProgress("alice", event(), { stage: "cards" });
    await store.commitProgress("alice", event(), { stage: "task_picker" });

    await expect(store.pendingCount("alice")).resolves.toBe(1);
    await expect(
      store.commitProgress("alice", event({ correct: false }), {
        stage: "lesson",
      }),
    ).rejects.toBeInstanceOf(LocalEventConflictError);
    await expect(store.loadSession("alice")).resolves.toEqual({
      stage: "task_picker",
    });
  });

  it("clears only one user's private data on logout", async () => {
    const store = new IndexedDbOfflineStore(`test-${crypto.randomUUID()}`);
    await store.commitProgress("alice", event(), { stage: "cards" });
    await store.saveSession("bob", { stage: "lesson" });
    await store.putContent("course-v1", { schema_version: 1 });

    await store.clearUserData("alice");

    await expect(store.loadSession("alice")).resolves.toBeNull();
    await expect(store.loadSession("bob")).resolves.toEqual({
      stage: "lesson",
    });
    await expect(store.getContent("course-v1")).resolves.toEqual({
      schema_version: 1,
    });
  });
});
