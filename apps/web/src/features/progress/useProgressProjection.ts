import { useEffect, useState } from "react";

import { useAuth } from "../../app/useAuth";
import type { BackendServices } from "../../data/backendServices";
import type { Json } from "../../data/database.types";
import {
  projectProgress,
  type ProgressProjection,
} from "../../domain/progressProjection";

interface ProgressProjectionState {
  projection: ProgressProjection | null;
  loading: boolean;
  errorCode: "NETWORK_UNAVAILABLE" | null;
}

export function useProgressProjection(
  services: BackendServices,
): ProgressProjectionState {
  const { user } = useAuth();
  const [state, setState] = useState<ProgressProjectionState>({
    projection: null,
    loading: true,
    errorCode: null,
  });

  useEffect(() => {
    if (!user) return;
    let active = true;
    void Promise.all([
      services.database
        .listProgressEvents(user.id, 500)
        .then((events) => ({ events, remoteAvailable: true }))
        .catch(() => ({ events: [], remoteAvailable: false })),
      services.offline.listPending(user.id),
    ])
      .then(async ([remote, pending]) => {
        const projection = projectProgress(
          [
            ...remote.events,
            ...pending.map((record) => ({
              ...record.event,
              user_id: user.id,
              received_at: record.createdAt,
            })),
          ],
          new Date().toISOString(),
        );
        if (active)
          setState({
            projection,
            loading: false,
            errorCode: remote.remoteAvailable ? null : "NETWORK_UNAVAILABLE",
          });
        if (!remote.remoteAvailable) return;
        const confirmedProjection = projectProgress(
          remote.events,
          projection.asOf,
        );
        await services.database.saveProgressProjection(
          user.id,
          confirmedProjection.topics.map((topic) => ({
            topic_id: topic.topicId,
            score: topic.mastery,
            evidence_count: topic.evidenceCount,
            recent_accuracy: topic.recentAccuracy,
            evidence: topic.evidence as unknown as Json,
            algorithm_version: confirmedProjection.algorithmVersion,
            as_of: confirmedProjection.asOf,
          })),
          confirmedProjection.cardStates.map((card) => ({
            card_id: card.cardId,
            due_at: card.dueAt,
            stability: card.stability,
            difficulty: card.difficulty,
            last_event_id: card.lastEventId,
            algorithm_version: confirmedProjection.algorithmVersion,
          })),
        );
      })
      .catch(() => {
        if (active)
          setState((current) => ({
            ...current,
            loading: false,
            errorCode: "NETWORK_UNAVAILABLE",
          }));
      });
    return () => {
      active = false;
    };
  }, [services, user]);

  return state;
}
