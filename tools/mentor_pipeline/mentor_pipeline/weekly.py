from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from mentor_pipeline.aggregate import aggregate_events
from mentor_pipeline.paths import ensure_within_workspace
from mentor_pipeline.pipeline_state import CursorStore, create_pipeline_backup
from mentor_pipeline.report import atomic_write_bytes
from mentor_pipeline.supabase_adapter import PipelineAdapter


def _user_ref(user_id: str) -> str:
    return hashlib.sha256(user_id.encode()).hexdigest()[:12]


def run_weekly_dry_run(
    adapter: PipelineAdapter,
    cursor_store: CursorStore,
    run_directory: Path,
) -> dict:
    """Fetch and aggregate bounded per-user batches without remote writes or cursor movement."""
    run_directory = ensure_within_workspace(run_directory)
    cursors = cursor_store.load()
    backup = create_pipeline_backup(adapter, run_directory / "pre-publish-backup.json")
    batches = adapter.fetch_user_batches(cursors.users)
    users = []
    for batch in batches:
        reference = _user_ref(batch.user_id)
        user_directory = run_directory / "users" / reference
        raw_directory = user_directory / "raw"
        raw_directory.mkdir(parents=True, exist_ok=True)
        for event in batch.events:
            pipeline_event = {
                key: value for key, value in event.items() if key != "received_at"
            }
            atomic_write_bytes(
                raw_directory / f"{event['event_id']}.json",
                (json.dumps(pipeline_event, ensure_ascii=False, sort_keys=True) + "\n").encode(),
            )
        pending_directory = user_directory / "pending_reviews"
        for review in batch.pending_reviews:
            atomic_write_bytes(
                pending_directory / f"{review['review_id']}.json",
                (json.dumps(review, ensure_ascii=False, sort_keys=True) + "\n").encode(),
            )
        summary = aggregate_events(raw_directory, user_directory / "summary.json", "default")
        users.append(
            {
                "user_ref": reference,
                "event_count": len(batch.events),
                "pending_review_count": len(batch.pending_reviews),
                "event_ids": [item["event_id"] for item in batch.events],
                "pending_review_ids": [item["review_id"] for item in batch.pending_reviews],
                "topic_count": len(summary["topics"]),
                "next_cursor": batch.next_cursor.model_dump(),
            }
        )
    report = {
        "schema_version": 1,
        "mode": "dry_run",
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "backup": backup.relative_to(run_directory).as_posix(),
        "user_count": len(users),
        "users": users,
        "cursor_advanced": False,
        "remote_writes": 0,
    }
    atomic_write_bytes(
        run_directory / "dry-run-report.json",
        (json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(),
    )
    return report
