import json
import shutil
from datetime import UTC, datetime

from mentor_pipeline.aggregate import aggregate_events
from mentor_pipeline.paths import repository_root

ROOT = repository_root()


def test_aggregate_matches_shared_progress_v1_fixture() -> None:
    fixture = json.loads((ROOT / "fixtures/progress-projection.v1.json").read_text())
    workspace = ROOT / ".mentor/sprint5-shared-fixture"
    shutil.rmtree(workspace, ignore_errors=True)
    source = workspace / "raw"
    source.mkdir(parents=True)
    for index, event in enumerate(fixture["events"]):
        (source / f"{index}.json").write_text(json.dumps(event), encoding="utf-8")

    summary = aggregate_events(
        source,
        workspace / "summary.json",
        "default",
        as_of=datetime.fromisoformat(fixture["as_of"].replace("Z", "+00:00")).astimezone(UTC),
    )

    topic = summary["topics"][0]
    assert topic["topic_id"] == fixture["expected"]["topic_id"]
    assert topic["mastery"] == fixture["expected"]["mastery"]
    assert topic["evidence_count"] == fixture["expected"]["evidence_count"]
    assert topic["recent_accuracy"] == fixture["expected"]["recent_accuracy"]


def test_aggregate_builds_weak_topic_and_private_pending_review_context() -> None:
    workspace = ROOT / ".mentor/sprint6-aggregate"
    shutil.rmtree(workspace, ignore_errors=True)
    source = workspace / "raw"
    source.mkdir(parents=True)
    event_id = "sprint6-pending-review-event"
    pending = ROOT / "content/progress/pending_reviews" / f"{event_id}.json"
    pending.unlink(missing_ok=True)
    event = {
        "schema_version": 1,
        "event_id": event_id,
        "user_id": "11111111-1111-4111-8111-111111111111",
        "device_id": "test-device",
        "profile_id": "default",
        "item_id": "foundations.data-tables.task-text",
        "event_type": "task_submitted",
        "occurred_at": "2026-08-18T08:00:00Z",
        "timezone": "Europe/Moscow",
        "payload": {
            "evaluation": "pending_review",
            "answer_ref": "local-attempt:sprint6-attempt-001",
            "answer": "Строка — наблюдение, столбец — признак.",
            "hints_used": 0,
            "confidence": 3,
        },
    }
    (source / "event.json").write_text(json.dumps(event), encoding="utf-8")

    try:
        summary = aggregate_events(source, workspace / "summary.json", "default")

        assert summary["topics"][0]["mastery"] == 0
        assert "answer" not in json.dumps(summary)
        payload = json.loads(pending.read_text())
        assert payload["attempt_id"] == "sprint6-attempt-001"
        assert payload["answer"].startswith("Строка")
    finally:
        pending.unlink(missing_ok=True)
