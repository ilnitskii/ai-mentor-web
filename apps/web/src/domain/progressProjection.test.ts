import type { ProgressEvent } from "../data/mentorDatabase";
import fixture from "../../../../fixtures/progress-projection.v1.json";
import { projectProgress } from "./progressProjection";

function event(
  id: string,
  type: string,
  occurredAt: string,
  payload: Record<string, string | number | boolean | null>,
  itemId = "foundations.data-tables.task-choice",
): ProgressEvent {
  return {
    event_id: id,
    user_id: "10000000-0000-4000-8000-000000000001",
    schema_version: 1,
    profile_id: "default",
    device_id: "synthetic-device",
    item_id: itemId,
    event_type: type,
    occurred_at: occurredAt,
    timezone: "Europe/Moscow",
    payload,
    received_at: occurredAt,
  };
}

describe("progress projection v1", () => {
  it("matches the shared browser/pipeline fixture", () => {
    const projection = projectProgress(
      fixture.events.map((item) => ({
        ...item,
        schema_version: 1 as const,
        received_at: item.occurred_at,
      })) as ProgressEvent[],
      fixture.as_of,
    );
    expect(projection.topics[0]).toMatchObject({
      topicId: fixture.expected.topic_id,
      mastery: fixture.expected.mastery,
      evidenceCount: fixture.expected.evidence_count,
      recentAccuracy: fixture.expected.recent_accuracy,
    });
    expect(projection.rewards.totalXp).toBe(fixture.expected.total_xp);
    expect(projection.cardStates[0].dueAt).toBe(fixture.expected.card_due_at);
    expect(projection.recentMistakes).toHaveLength(
      fixture.expected.recent_mistake_count,
    );
  });

  it("caps reading-only mastery at 40", () => {
    const projection = projectProgress(
      [
        event(
          "10000000-0000-4000-8000-000000000001",
          "lesson_completed",
          "2026-08-18T08:00:00Z",
          { correct: true },
          "foundations.data-tables.intro",
        ),
      ],
      "2026-08-18T09:00:00Z",
    );
    expect(projection.topics[0].mastery).toBe(40);
  });

  it("reduces hinted evidence without discarding it and resists repeat grinding", () => {
    const projection = projectProgress(
      [
        event(
          "10000000-0000-4000-8000-000000000001",
          "task_submitted",
          "2026-08-18T08:00:00Z",
          { correct: true, hints_used: 1 },
        ),
        event(
          "10000000-0000-4000-8000-000000000002",
          "task_submitted",
          "2026-08-18T08:10:00Z",
          { correct: false, hints_used: 0 },
        ),
      ],
      "2026-08-18T09:00:00Z",
    );
    expect(projection.topics[0].evidence[0].weight).toBe(0.5);
    expect(projection.topics[0].evidence[1].weight).toBe(0.25);
    expect(projection.topics[0].mastery).toBe(67);
  });

  it("deduplicates XP, handles a DST boundary, and ignores future clock skew", () => {
    const first = event(
      "10000000-0000-4000-8000-000000000001",
      "task_submitted",
      "2026-03-28T22:30:00Z",
      { correct: true },
    );
    first.timezone = "Europe/Berlin";
    const second = event(
      "10000000-0000-4000-8000-000000000002",
      "task_submitted",
      "2026-03-29T22:30:00Z",
      { correct: true },
    );
    second.timezone = "Europe/Berlin";
    const future = event(
      "10000000-0000-4000-8000-000000000003",
      "task_submitted",
      "2026-04-02T00:00:00Z",
      { correct: true },
    );
    const projection = projectProgress(
      [first, first, second, future],
      "2026-03-30T00:00:00Z",
    );
    expect(projection.rewards.totalXp).toBe(24);
    expect(projection.rewards.streak).toBe(2);
    expect(projection.ignoredFutureEvents).toBe(1);
  });

  it("schedules cards deterministically and records mistakes", () => {
    const projection = projectProgress(
      [
        event(
          "10000000-0000-4000-8000-000000000001",
          "card_reviewed",
          "2026-08-18T08:00:00Z",
          { correct: false, rating: "easy" },
          "foundations.data-tables.card-001",
        ),
      ],
      "2026-08-18T09:00:00Z",
    );
    expect(projection.cardStates[0]).toMatchObject({
      stability: 0.5,
      difficulty: 6,
      dueAt: "2026-08-18T20:00:00.000Z",
    });
    expect(projection.recentMistakes).toHaveLength(1);
  });

  it("rebuilds the same projection regardless of input ordering", () => {
    const events = [
      event(
        "10000000-0000-4000-8000-000000000001",
        "task_submitted",
        "2026-08-17T08:00:00Z",
        { correct: false },
      ),
      event(
        "10000000-0000-4000-8000-000000000002",
        "task_submitted",
        "2026-08-18T08:00:00Z",
        { correct: true },
      ),
    ];
    expect(projectProgress(events, "2026-08-18T09:00:00Z")).toEqual(
      projectProgress([...events].reverse(), "2026-08-18T09:00:00Z"),
    );
  });

  it("awards a shield after three completed days and allows one soft return", () => {
    const events = ["01", "02", "03", "05"].map((day, index) =>
      event(
        `10000000-0000-4000-8000-00000000000${index + 1}`,
        "task_submitted",
        `2026-08-${day}T08:00:00Z`,
        { correct: true },
      ),
    );
    const rewards = projectProgress(events, "2026-08-05T09:00:00Z").rewards;
    expect(rewards).toMatchObject({
      streak: 4,
      shields: 1,
      softReturnUsed: true,
    });
  });
});
