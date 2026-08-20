import { FakeMentorDatabase } from "./fakeBackendClient";

describe("FakeMentorDatabase", () => {
  it("stores typed append-only progress events per user", async () => {
    const database = new FakeMentorDatabase();
    const event = {
      event_id: "11000000-0000-4000-8000-000000000001",
      schema_version: 1 as const,
      profile_id: "default",
      device_id: "synthetic-device",
      item_id: "sql.window-functions.task-choice",
      event_type: "task_submitted",
      occurred_at: "2026-08-18T08:00:00Z",
      timezone: "UTC",
      payload: { attempt: 1, correct: true },
    };

    await database.appendProgressEvent("alice", event);

    await expect(database.listProgressEvents("alice")).resolves.toMatchObject([
      { event_id: event.event_id, user_id: "alice" },
    ]);
    await expect(database.listProgressEvents("bob")).resolves.toEqual([]);
    await expect(database.appendProgressEvent("alice", event)).rejects.toThrow(
      "EVENT_CONFLICT",
    );
  });

  it("stores free answers with pending_review status", async () => {
    const database = new FakeMentorDatabase();
    await expect(
      database.submitPendingReview("alice", {
        review_id: "44000000-0000-4000-8000-000000000004",
        attempt_id: "44000000-0000-4000-8000-000000000005",
        task_id: "foundations.data-tables.task-text",
        answer: "Synthetic free answer",
      }),
    ).resolves.toMatchObject({
      user_id: "alice",
      status: "pending_review",
    });
  });
});
