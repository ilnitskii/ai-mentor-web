import type { ProgressEvent } from "../data/mentorDatabase";
import type { CardRating } from "./learningSession";

export const PROJECTION_ALGORITHM_VERSION = "progress-v1";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface EvidenceItem {
  eventId: string;
  itemId: string;
  occurredAt: string;
  outcome: boolean | null;
  weight: number;
  hintsUsed: number;
}

export interface TopicProjection {
  topicId: string;
  mastery: number;
  evidenceCount: number;
  gradedCount: number;
  recentAccuracy: number | null;
  evidence: EvidenceItem[];
}

export interface CardStateProjection {
  cardId: string;
  dueAt: string;
  stability: number;
  difficulty: number;
  lastEventId: string;
}

export interface RewardDay {
  date: string;
  xp: number;
  verifiedAnswers: number;
  completed: boolean;
}

export interface RewardProjection {
  totalXp: number;
  streak: number;
  shields: number;
  softReturnUsed: boolean;
  days: RewardDay[];
}

export interface MistakeProjection {
  eventId: string;
  itemId: string;
  topicId: string;
  occurredAt: string;
  hintsUsed: number;
}

export interface ProgressProjection {
  algorithmVersion: typeof PROJECTION_ALGORITHM_VERSION;
  asOf: string;
  topics: TopicProjection[];
  cardStates: CardStateProjection[];
  rewards: RewardProjection;
  recentMistakes: MistakeProjection[];
  ignoredFutureEvents: number;
}

type Payload = Record<string, unknown>;

function payloadOf(event: ProgressEvent): Payload {
  return event.payload && typeof event.payload === "object"
    ? (event.payload as Payload)
    : {};
}

export function topicIdForEvent(event: ProgressEvent): string {
  const explicit = payloadOf(event).topic_id;
  if (typeof explicit === "string") return explicit;
  for (const marker of [".task-", ".card-"]) {
    if (event.item_id.includes(marker)) return event.item_id.split(marker)[0];
  }
  return event.item_id.split(".").slice(0, -1).join(".") || event.item_id;
}

function outcomeOf(event: ProgressEvent): boolean | null {
  const payload = payloadOf(event);
  if (typeof payload.correct === "boolean") return payload.correct;
  const evaluation = payload.evaluation ?? payload.check_result;
  if (evaluation === "correct") return true;
  if (evaluation === "incorrect") return false;
  return null;
}

function baseEvidenceWeight(eventType: string): number {
  return (
    {
      lesson_completed: 0.2,
      card_reviewed: 0.6,
      task_submitted: 1,
      mistake_corrected: 0.8,
      plan_completed: 0,
    }[eventType] ?? 0
  );
}

function freshnessMultiplier(occurredAt: string, asOf: Date): number {
  const ageDays = Math.max(
    0,
    (asOf.getTime() - new Date(occurredAt).getTime()) / 86_400_000,
  );
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.85;
  return 0.7;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dayKey(timestamp: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp));
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

function cardRating(event: ProgressEvent): CardRating | null {
  const rating = payloadOf(event).rating;
  return ["again", "hard", "good", "easy"].includes(String(rating))
    ? (rating as CardRating)
    : null;
}

function nextCardState(
  current: CardStateProjection | undefined,
  event: ProgressEvent,
): CardStateProjection | null {
  const rating = cardRating(event);
  if (!rating) return current ?? null;
  const previousStability = current?.stability ?? 1;
  const previousDifficulty = current?.difficulty ?? 5;
  const correct = outcomeOf(event);
  const effectiveRating = correct === false ? "again" : rating;
  const policy = {
    again: { factor: 0.5, minDays: 0.25, difficulty: 1 },
    hard: { factor: 1.2, minDays: 1, difficulty: 0.5 },
    good: { factor: 2, minDays: 1, difficulty: -0.2 },
    easy: { factor: 3, minDays: 2, difficulty: -0.7 },
  }[effectiveRating];
  const stability = round(Math.max(0.5, previousStability * policy.factor));
  const intervalDays = Math.max(policy.minDays, stability);
  const dueAt = new Date(
    new Date(event.occurred_at).getTime() + intervalDays * 86_400_000,
  ).toISOString();
  return {
    cardId: event.item_id,
    dueAt,
    stability,
    difficulty: round(
      Math.max(1, Math.min(10, previousDifficulty + policy.difficulty)),
    ),
    lastEventId: event.event_id,
  };
}

function xpForEvent(event: ProgressEvent, easyXpForDay: number): number {
  const outcome = outcomeOf(event);
  if (event.event_type === "lesson_completed") return 5;
  if (event.event_type === "task_submitted") return outcome === true ? 12 : 6;
  if (event.event_type === "mistake_corrected") return 8;
  if (event.event_type === "card_reviewed") {
    if (cardRating(event) === "easy") return easyXpForDay >= 10 ? 0 : 1;
    return 2;
  }
  return 0;
}

function dateOrdinal(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

function rewardsForEvents(events: ProgressEvent[]): RewardProjection {
  const byDay = new Map<string, RewardDay>();
  const easyXp = new Map<string, number>();
  for (const event of events) {
    const date = dayKey(event.occurred_at, event.timezone || "UTC");
    const day = byDay.get(date) ?? {
      date,
      xp: 0,
      verifiedAnswers: 0,
      completed: false,
    };
    const xp = xpForEvent(event, easyXp.get(date) ?? 0);
    day.xp += xp;
    if (event.event_type === "card_reviewed" && cardRating(event) === "easy")
      easyXp.set(date, (easyXp.get(date) ?? 0) + xp);
    if (
      ["task_submitted", "card_reviewed", "mistake_corrected"].includes(
        event.event_type,
      ) &&
      outcomeOf(event) !== null
    )
      day.verifiedAnswers += 1;
    byDay.set(date, day);
  }

  const days = [...byDay.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day) => ({
      ...day,
      completed: day.xp >= 10 && day.verifiedAnswers > 0,
    }));
  let streak = 0;
  let shields = 0;
  let softReturnUsed = false;
  let previousDate: string | null = null;
  for (const day of days.filter((item) => item.completed)) {
    if (!previousDate) {
      streak = 1;
    } else {
      const gap = dateOrdinal(day.date) - dateOrdinal(previousDate);
      if (gap === 1) streak += 1;
      else if (gap === 2 && !softReturnUsed) {
        streak += 1;
        softReturnUsed = true;
      } else if (gap === 2 && shields > 0) {
        streak += 1;
        shields -= 1;
      } else {
        streak = 1;
        softReturnUsed = false;
      }
    }
    if (streak > 0 && streak % 3 === 0) shields = Math.min(2, shields + 1);
    previousDate = day.date;
  }
  return {
    totalXp: days.reduce((sum, day) => sum + day.xp, 0),
    streak,
    shields,
    softReturnUsed,
    days,
  };
}

export function projectProgress(
  inputEvents: ProgressEvent[],
  asOfTimestamp: string,
): ProgressProjection {
  const asOf = new Date(asOfTimestamp);
  const seen = new Set<string>();
  let ignoredFutureEvents = 0;
  const events = inputEvents
    .filter((event) => {
      if (seen.has(event.event_id)) return false;
      seen.add(event.event_id);
      if (
        new Date(event.occurred_at).getTime() >
        asOf.getTime() + MAX_CLOCK_SKEW_MS
      ) {
        ignoredFutureEvents += 1;
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        left.occurred_at.localeCompare(right.occurred_at) ||
        left.event_id.localeCompare(right.event_id),
    );

  const topics = new Map<
    string,
    {
      evidence: EvidenceItem[];
      correct: number;
      graded: number;
      weightedCorrect: number;
      weight: number;
      lessonOnly: boolean;
      itemUses: Map<string, number>;
    }
  >();
  const cardStates = new Map<string, CardStateProjection>();
  const recentMistakes: MistakeProjection[] = [];

  for (const event of events) {
    const topicId = topicIdForEvent(event);
    const topic = topics.get(topicId) ?? {
      evidence: [],
      correct: 0,
      graded: 0,
      weightedCorrect: 0,
      weight: 0,
      lessonOnly: true,
      itemUses: new Map<string, number>(),
    };
    const payload = payloadOf(event);
    const hintsUsed =
      typeof payload.hints_used === "number" ? payload.hints_used : 0;
    const useCount = topic.itemUses.get(event.item_id) ?? 0;
    let weight = baseEvidenceWeight(event.event_type);
    if (hintsUsed > 0) weight *= 0.5;
    if (payload.solution_viewed === true) weight *= 0.5;
    weight *= freshnessMultiplier(event.occurred_at, asOf);
    if (useCount > 0) weight *= 0.25;
    weight = round(weight);
    topic.itemUses.set(event.item_id, useCount + 1);
    const outcome = outcomeOf(event);
    topic.evidence.push({
      eventId: event.event_id,
      itemId: event.item_id,
      occurredAt: event.occurred_at,
      outcome,
      weight,
      hintsUsed,
    });
    if (event.event_type !== "lesson_completed") topic.lessonOnly = false;
    if (outcome !== null && weight > 0) {
      topic.graded += 1;
      topic.correct += Number(outcome);
      topic.weight += weight;
      topic.weightedCorrect += Number(outcome) * weight;
    }
    topics.set(topicId, topic);

    if (event.event_type === "card_reviewed") {
      const next = nextCardState(cardStates.get(event.item_id), event);
      if (next) cardStates.set(event.item_id, next);
    }
    if (outcome === false) {
      recentMistakes.push({
        eventId: event.event_id,
        itemId: event.item_id,
        topicId,
        occurredAt: event.occurred_at,
        hintsUsed,
      });
    }
  }

  return {
    algorithmVersion: PROJECTION_ALGORITHM_VERSION,
    asOf: asOf.toISOString(),
    topics: [...topics.entries()]
      .map(([topicId, topic]) => {
        let mastery = topic.weight
          ? Math.round((100 * topic.weightedCorrect) / topic.weight)
          : 0;
        if (topic.lessonOnly) mastery = Math.min(40, mastery);
        return {
          topicId,
          mastery,
          evidenceCount: topic.evidence.length,
          gradedCount: topic.graded,
          recentAccuracy: topic.graded ? topic.correct / topic.graded : null,
          evidence: topic.evidence,
        };
      })
      .sort((left, right) => left.topicId.localeCompare(right.topicId)),
    cardStates: [...cardStates.values()].sort((left, right) =>
      left.cardId.localeCompare(right.cardId),
    ),
    rewards: rewardsForEvents(events),
    recentMistakes: recentMistakes
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 20),
    ignoredFutureEvents,
  };
}
