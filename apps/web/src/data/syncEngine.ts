import type {
  MentorDatabase,
  NewProgressEvent,
  PendingReview,
  PendingReviewInput,
  ProgressEvent,
} from "./mentorDatabase";
import type { OfflineStore } from "./offlineStore";

export class EventConflictError extends Error {
  readonly code = "EVENT_CONFLICT";

  constructor(readonly eventId: string) {
    super("EVENT_CONFLICT");
  }
}

function sameEvent(remote: ProgressEvent, local: NewProgressEvent): boolean {
  return (
    remote.event_id === local.event_id &&
    remote.schema_version === local.schema_version &&
    remote.profile_id === local.profile_id &&
    remote.device_id === local.device_id &&
    remote.item_id === local.item_id &&
    remote.event_type === local.event_type &&
    remote.occurred_at === local.occurred_at &&
    remote.timezone === local.timezone &&
    JSON.stringify(remote.payload) === JSON.stringify(local.payload)
  );
}

function sameReview(remote: PendingReview, local: PendingReviewInput): boolean {
  return (
    remote.review_id === local.review_id &&
    remote.attempt_id === local.attempt_id &&
    remote.task_id === local.task_id &&
    remote.answer === local.answer
  );
}

export class SyncEngine {
  constructor(
    private readonly database: MentorDatabase,
    private readonly offline: OfflineStore,
  ) {}

  async sync(userId: string): Promise<{ delivered: number }> {
    let delivered = 0;
    for (const record of await this.offline.listPendingReviews(userId)) {
      let remote = await this.database.getPendingReview(
        userId,
        record.review.attempt_id,
      );
      if (remote) {
        if (!sameReview(remote, record.review)) {
          await this.offline.markReviewConflict(record.review.attempt_id);
          throw new EventConflictError(record.review.attempt_id);
        }
        await this.offline.markReviewDelivered(record.review.attempt_id);
        continue;
      }

      try {
        await this.database.submitPendingReview(userId, record.review);
      } catch (error) {
        remote = await this.database.getPendingReview(
          userId,
          record.review.attempt_id,
        );
        if (!remote) throw error;
        if (!sameReview(remote, record.review)) {
          await this.offline.markReviewConflict(record.review.attempt_id);
          throw new EventConflictError(record.review.attempt_id);
        }
      }
      await this.offline.markReviewDelivered(record.review.attempt_id);
    }

    for (const record of await this.offline.listPending(userId)) {
      let remote = await this.database.getProgressEvent(
        userId,
        record.event.event_id,
      );
      if (remote) {
        if (!sameEvent(remote, record.event)) {
          await this.offline.markConflict(record.event.event_id);
          throw new EventConflictError(record.event.event_id);
        }
        await this.offline.markDelivered(record.event.event_id);
        delivered += 1;
        continue;
      }

      try {
        await this.database.appendProgressEvent(userId, record.event);
      } catch (error) {
        remote = await this.database.getProgressEvent(
          userId,
          record.event.event_id,
        );
        if (!remote) throw error;
        if (!sameEvent(remote, record.event)) {
          await this.offline.markConflict(record.event.event_id);
          throw new EventConflictError(record.event.event_id);
        }
      }

      await this.offline.markDelivered(record.event.event_id);
      delivered += 1;
    }
    return { delivered };
  }
}
