import type { NewProgressEvent } from "../data/mentorDatabase";

type EventType =
  "lesson_completed" | "card_reviewed" | "task_submitted" | "plan_completed";

let sessionDeviceId: string | null = null;

export function createProgressEvent(
  itemId: string,
  eventType: EventType,
  payload: Record<string, string | number | boolean | null>,
  idFactory: () => string = () => crypto.randomUUID(),
): NewProgressEvent {
  sessionDeviceId ??= `web-${idFactory()}`;
  return {
    event_id: idFactory(),
    schema_version: 1,
    profile_id: "default",
    device_id: sessionDeviceId,
    item_id: itemId,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    payload,
  };
}
