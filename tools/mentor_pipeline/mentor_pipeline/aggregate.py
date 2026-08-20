from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

from mentor_pipeline.models import ProgressEvent
from mentor_pipeline.paths import ensure_within_workspace
from mentor_pipeline.report import atomic_write_bytes
from mentor_pipeline.schema import load_json, validate_json


def _topic_id(event: ProgressEvent) -> str:
    explicit = event.payload.get("topic_id")
    if isinstance(explicit, str):
        return explicit
    for marker in (".task-", ".card-"):
        if marker in event.item_id:
            return event.item_id.split(marker, maxsplit=1)[0]
    return event.item_id.rsplit(".", maxsplit=1)[0]


def _outcome(event: ProgressEvent) -> bool | None:
    correct = event.payload.get("correct")
    if isinstance(correct, bool):
        return correct
    evaluation = event.payload.get("evaluation") or event.payload.get("check_result")
    if evaluation == "correct":
        return True
    if evaluation == "incorrect":
        return False
    return None


def _evidence_weight(event: ProgressEvent, as_of: datetime, repeated: bool) -> float:
    base = {
        "lesson_completed": 0.2,
        "card_reviewed": 0.6,
        "task_submitted": 1.0,
        "mistake_corrected": 0.8,
        "plan_completed": 0.0,
    }[event.event_type]
    hints = event.payload.get("hints_used", 0)
    if isinstance(hints, int) and hints > 0:
        base *= 0.5
    if event.payload.get("solution_viewed") is True:
        base *= 0.5
    age_days = max(0.0, (as_of - event.occurred_at).total_seconds() / 86_400)
    base *= 1.0 if age_days <= 7 else 0.85 if age_days <= 30 else 0.7
    if repeated:
        base *= 0.25
    return round(base, 4)


def _write_pending_review(root: Path, event: ProgressEvent) -> None:
    if event.payload.get("evaluation") != "pending_review":
        return
    answer = event.payload.get("answer")
    if not isinstance(answer, str):
        return
    answer_ref = event.payload.get("answer_ref", "")
    attempt_id = answer_ref.removeprefix("local-attempt:") or event.event_id
    pending = {
        "schema_version": 1,
        "event_id": event.event_id,
        "attempt_id": attempt_id,
        "task_id": event.item_id,
        "submitted_at": event.occurred_at.isoformat().replace("+00:00", "Z"),
        "answer": answer,
        "hints_used": int(event.payload.get("hints_used", 0)),
        "confidence": event.payload.get("confidence"),
    }
    validate_json(pending, root / "schemas/pending-review.schema.json")
    atomic_write_bytes(
        root / "content/progress/pending_reviews" / f"{event.event_id}.json",
        (json.dumps(pending, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(),
    )


def aggregate_events(
    source: Path,
    output: Path,
    profile_id: str,
    *,
    as_of: datetime | None = None,
) -> dict:
    ensure_within_workspace(source)
    ensure_within_workspace(output)
    topics: dict[str, dict] = defaultdict(
        lambda: {
            "evidence_count": 0,
            "correct_count": 0,
            "graded_count": 0,
            "weighted_correct": 0.0,
            "weight": 0.0,
            "lesson_only": True,
            "items_seen": set(),
        }
    )
    projection_time = (as_of or datetime.now(UTC)).astimezone(UTC)
    parsed_events = []
    seen_event_ids: set[str] = set()
    for path in sorted(source.glob("*.json")):
        event = ProgressEvent.model_validate(load_json(path))
        if event.profile_id != profile_id:
            continue
        if event.event_id in seen_event_ids:
            continue
        seen_event_ids.add(event.event_id)
        if event.occurred_at > projection_time + timedelta(minutes=5):
            continue
        parsed_events.append(event)
        _write_pending_review(output.parents[2], event)

    events = sorted(parsed_events, key=lambda item: (item.occurred_at, item.event_id))
    for event in events:
        item = topics[_topic_id(event)]
        item["evidence_count"] += 1
        correct = _outcome(event)
        repeated = event.item_id in item["items_seen"]
        item["items_seen"].add(event.item_id)
        weight = _evidence_weight(event, projection_time, repeated)
        if event.event_type != "lesson_completed":
            item["lesson_only"] = False
        if correct is not None:
            item["graded_count"] += 1
            item["correct_count"] += int(correct)
            item["weighted_correct"] += int(correct) * weight
            item["weight"] += weight

    topic_rows = []
    for topic_id, values in sorted(topics.items()):
        graded = values["graded_count"]
        accuracy = values["correct_count"] / graded if graded else None
        mastery = (
            round(100 * values["weighted_correct"] / values["weight"]) if values["weight"] else 0
        )
        if values["lesson_only"]:
            mastery = min(mastery, 40)
        topic_rows.append(
            {
                "topic_id": topic_id,
                "mastery": mastery,
                "evidence_count": values["evidence_count"],
                "recent_accuracy": accuracy,
            }
        )
    recent_mistakes = []
    for event in sorted(events, key=lambda item: item.occurred_at, reverse=True):
        if _outcome(event) is not False:
            continue
        recent_mistakes.append(
            {
                "event_id": event.event_id,
                "item_id": event.item_id,
                "topic_id": _topic_id(event),
                "occurred_at": event.occurred_at.isoformat().replace("+00:00", "Z"),
                "hints_used": int(event.payload.get("hints_used", 0)),
                "attempt": event.payload.get("attempt"),
            }
        )
        if len(recent_mistakes) == 20:
            break
    summary = {
        "schema_version": 1,
        "profile_id": profile_id,
        "generated_at": projection_time.isoformat().replace("+00:00", "Z"),
        "unseen_event_count": len(events),
        "topics": topic_rows,
    }
    atomic_write_bytes(
        output,
        (json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(),
    )
    mistakes = {"schema_version": 1, "profile_id": profile_id, "items": recent_mistakes}
    atomic_write_bytes(
        output.with_name("recent_mistakes.json"),
        (json.dumps(mistakes, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(),
    )
    return summary
