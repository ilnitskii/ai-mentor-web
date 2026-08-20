from __future__ import annotations

import json
import os
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import yaml

from mentor_pipeline.candidate import directory_digest, validate_and_compile_candidate
from mentor_pipeline.errors import PipelineError
from mentor_pipeline.paths import ensure_within_workspace
from mentor_pipeline.pipeline_state import CursorStore, create_pipeline_backup
from mentor_pipeline.schema import validate_json
from mentor_pipeline.supabase_adapter import PipelineAdapter, UserBatch


@dataclass(frozen=True)
class CandidateApproval:
    digest: str


@contextmanager
def weekly_run_lock(path: Path) -> Iterator[None]:
    path = ensure_within_workspace(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as error:
        raise PipelineError("WEEKLY_RUN_LOCKED", "Another weekly run owns the lock") from error
    try:
        os.write(
            descriptor,
            json.dumps(
                {"pid": os.getpid(), "started_at": datetime.now(UTC).isoformat()}
            ).encode(),
        )
    finally:
        os.close(descriptor)
    try:
        yield
    finally:
        path.unlink(missing_ok=True)


def approve_candidate(candidate_directory: Path) -> CandidateApproval:
    candidate_directory = ensure_within_workspace(candidate_directory)
    return CandidateApproval(digest=directory_digest(candidate_directory))


def quarantine_candidate(candidate_directory: Path, quarantine_root: Path) -> Path:
    candidate_directory = ensure_within_workspace(candidate_directory)
    quarantine_root = ensure_within_workspace(quarantine_root)
    quarantine_root.mkdir(parents=True, exist_ok=True)
    destination = quarantine_root / candidate_directory.name
    if destination.exists():
        raise PipelineError("RUN_STATE_INVALID", "Candidate is already quarantined")
    candidate_directory.replace(destination)
    return destination


def _yaml_object(path: Path) -> dict:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise PipelineError("VALIDATION_FAILED", f"{path.name} must contain an object")
    return value


def _candidate_file(directory: Path, stem: str) -> Path:
    matches = [
        path
        for suffix in ("yaml", "yml")
        if (path := directory / f"{stem}.{suffix}").is_file()
    ]
    if len(matches) != 1:
        raise PipelineError("VALIDATION_FAILED", f"Exactly one {stem} file is required")
    return matches[0]


def validate_candidate_for_batch(
    root: Path,
    candidate_directory: Path,
    batch: UserBatch,
) -> dict:
    root = ensure_within_workspace(root)
    candidate_directory = ensure_within_workspace(candidate_directory, root)
    validate_and_compile_candidate(
        root,
        candidate_directory,
        root / "fixtures/course.valid.json",
        candidate_directory / "candidate-course.json",
    )
    report = _yaml_object(_candidate_file(candidate_directory, "weekly_report"))
    assignment = _yaml_object(_candidate_file(candidate_directory, "assignment"))
    pending_by_attempt = {item["attempt_id"]: item for item in batch.pending_reviews}
    reviews = []
    review_directory = candidate_directory / "reviews"
    if review_directory.exists():
        for path in sorted(review_directory.glob("*.yaml")):
            review = _yaml_object(path)
            validate_json(review, root / "schemas/review.schema.json")
            pending = pending_by_attempt.get(review["attempt_id"])
            if not pending or pending["task_id"] != review["task_id"]:
                raise PipelineError(
                    "VALIDATION_FAILED",
                    "Review does not match this user's pending batch",
                    review_id=review["review_id"],
                )
            reviews.append({**review, "pending_review_id": pending["review_id"]})
    if len(reviews) != len(batch.pending_reviews):
        raise PipelineError("VALIDATION_FAILED", "Every pending answer needs one review")
    return {"report": report, "assignment": assignment, "reviews": reviews}


def _db_uuid(user_id: str, kind: str, stable_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"ai-mentor:{user_id}:{kind}:{stable_id}"))


def _run_uuid(batch: UserBatch, report: dict) -> str:
    key = json.dumps(
        {
            "user_id": batch.user_id,
            "period_start": report["period_start"],
            "period_end": report["period_end"],
            "cursor": batch.next_cursor.model_dump(),
        },
        sort_keys=True,
    )
    return str(uuid.uuid5(uuid.NAMESPACE_URL, key))


def publish_approved_candidate(
    root: Path,
    adapter: PipelineAdapter,
    cursor_store: CursorStore,
    batch: UserBatch,
    candidate_directory: Path,
    approval: CandidateApproval,
    backup_path: Path,
) -> bool:
    root = ensure_within_workspace(root)
    candidate_directory = ensure_within_workspace(candidate_directory, root)
    if directory_digest(candidate_directory) != approval.digest:
        raise PipelineError("CANDIDATE_TAMPERED", "Candidate changed after manual approval")
    bundle = validate_candidate_for_batch(root, candidate_directory, batch)
    create_pipeline_backup(adapter, backup_path)
    report = {
        **bundle["report"],
        "db_report_id": _db_uuid(batch.user_id, "report", bundle["report"]["report_id"]),
    }
    assignment = {
        **bundle["assignment"],
        "db_assignment_id": _db_uuid(
            batch.user_id, "assignment", bundle["assignment"]["assignment_id"]
        ),
    }
    reviews = [
        {
            **review,
            "db_review_id": _db_uuid(batch.user_id, "review", review["review_id"]),
            "status": "needs_human_review" if review["needs_human_review"] else "reviewed",
        }
        for review in bundle["reviews"]
    ]
    published = adapter.publish_bundle(
        run_id=_run_uuid(batch, report),
        user_id=batch.user_id,
        report=report,
        assignment=assignment,
        reviews=reviews,
        input_cursor=batch.next_cursor.model_dump(),
    )
    cursors = cursor_store.load()
    cursors.users[batch.user_id] = batch.next_cursor
    cursor_store.save(cursors)
    return published


class SyntheticCandidateGenerator:
    """Deterministic test generator; it never invokes Codex or uses network."""

    def generate(self, batch: UserBatch, destination: Path) -> Path:
        destination = ensure_within_workspace(destination)
        destination.mkdir(parents=True, exist_ok=False)
        outcomes = [item.get("payload", {}).get("correct") for item in batch.events]
        failures = sum(value is False for value in outcomes)
        topic = "foundations.data-tables"
        period = {"period_start": "2026-08-10", "period_end": "2026-08-16"}
        report_id = f"weekly.synthetic.{_run_uuid(batch, period)[:12]}"
        (destination / "run_summary.md").write_text(
            f"# Synthetic run\n\nEvents: {len(batch.events)}; failures: {failures}.\n",
            encoding="utf-8",
        )
        report = {
            "schema_version": 1,
            "report_id": report_id,
            "period_start": "2026-08-10",
            "period_end": "2026-08-16",
            "summary": f"Synthetic batch contains {failures} incorrect answers.",
            "improvements": [],
            "weak_topics": [
                {
                    "topic_id": topic,
                    "evidence": f"Incorrect answers: {failures}.",
                    "action": "Complete an independent table-grain task.",
                }
            ],
            "next_focus": "Table grain and data quality.",
        }
        assignment = {
            "schema_version": 1,
            "assignment_id": f"assignment.{report_id}",
            "report_id": report_id,
            "title": "Synthetic weekly control",
            "estimated_minutes": 25,
            "task_ids": [
                "foundations.data-tables.task-choice",
                "foundations.data-tables.task-number",
                "foundations.data-tables.task-quality",
                "foundations.data-tables.task-text",
            ],
            "rationale": "Verify the weak topic with active practice.",
        }
        (destination / "weekly_report.yaml").write_text(
            yaml.safe_dump(report, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )
        (destination / "assignment.yaml").write_text(
            yaml.safe_dump(assignment, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )
        (destination / "daily_plan.yaml").write_text(
            yaml.safe_dump(
                {
                    "date": "2026-08-18",
                    "target_minutes": 10,
                    "rationale": "Synthetic weak-topic retrieval.",
                    "items": [
                        {"item_id": "foundations.data-tables.card-001", "type": "card"},
                        {"item_id": "foundations.data-tables.card-002", "type": "card"},
                        {
                            "item_id": "foundations.data-tables.task-choice",
                            "type": "task",
                        },
                    ],
                },
                allow_unicode=True,
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        if batch.pending_reviews:
            review_directory = destination / "reviews"
            review_directory.mkdir()
            for pending in batch.pending_reviews:
                review = {
                    "schema_version": 1,
                    "review_id": f"review.synthetic.{pending['attempt_id']}",
                    "attempt_id": pending["attempt_id"],
                    "task_id": pending["task_id"],
                    "score": 70,
                    "feedback": "Synthetic review for deterministic pipeline verification.",
                    "misconceptions": [],
                    "next_action": "Write one more concise explanation.",
                    "strong_point": "The answer addresses the requested concept.",
                    "specific_error": None,
                    "improved_reasoning": "State the grain, then name each column role.",
                    "criteria": [
                        {
                            "criterion": "Synthetic rubric",
                            "points_awarded": 70,
                            "points_possible": 100,
                        }
                    ],
                    "needs_human_review": False,
                }
                (review_directory / f"{pending['attempt_id']}.yaml").write_text(
                    yaml.safe_dump(review, allow_unicode=True, sort_keys=False),
                    encoding="utf-8",
                )
        return destination
