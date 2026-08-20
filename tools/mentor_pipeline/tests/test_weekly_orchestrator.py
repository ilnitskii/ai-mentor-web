import json
import shutil

import pytest
import yaml

from mentor_pipeline.errors import PipelineError
from mentor_pipeline.paths import repository_root
from mentor_pipeline.pipeline_state import CursorStore
from mentor_pipeline.supabase_adapter import FakePipelineAdapter
from mentor_pipeline.weekly_orchestrator import (
    SyntheticCandidateGenerator,
    approve_candidate,
    publish_approved_candidate,
    validate_candidate_for_batch,
    weekly_run_lock,
)

ROOT = repository_root()
SOURCE = ROOT / "fixtures/pipeline-source.synthetic.json"


def adapter() -> FakePipelineAdapter:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    return FakePipelineAdapter(
        profiles=source["profiles"],
        events=source["events"],
        pending_reviews=source["pending_reviews"],
        tables=source["tables"],
    )


def test_two_users_receive_independent_synthetic_candidates() -> None:
    workspace = ROOT / ".mentor/test-sprint7-users"
    shutil.rmtree(workspace, ignore_errors=True)
    batches = adapter().fetch_user_batches({})
    generator = SyntheticCandidateGenerator()
    summaries = []
    for index, batch in enumerate(batches):
        candidate = generator.generate(batch, workspace / f"candidate-{index}")
        bundle = validate_candidate_for_batch(ROOT, candidate, batch)
        summaries.append(bundle["report"]["summary"])
    assert summaries[0] != summaries[1]
    assert "1 incorrect" in summaries[0]
    assert "0 incorrect" in summaries[1]


def test_publish_is_idempotent_and_commits_cursor_last() -> None:
    workspace = ROOT / ".mentor/test-sprint7-publish"
    shutil.rmtree(workspace, ignore_errors=True)
    pipeline = adapter()
    batch = pipeline.fetch_user_batches({})[0]
    candidate = SyntheticCandidateGenerator().generate(batch, workspace / "candidate")
    approval = approve_candidate(candidate)
    store = CursorStore(workspace / "cursors.json")

    first = publish_approved_candidate(
        ROOT,
        pipeline,
        store,
        batch,
        candidate,
        approval,
        workspace / "backup-1.json",
    )
    second = publish_approved_candidate(
        ROOT,
        pipeline,
        store,
        batch,
        candidate,
        approval,
        workspace / "backup-2.json",
    )

    assert first is True
    assert second is False
    assert len(pipeline.tables["weekly_reports"]) == 1
    assert len(pipeline.tables["assignments"]) == 1
    assert store.load().users[batch.user_id] == batch.next_cursor


def test_candidate_tampering_blocks_publish_and_cursor() -> None:
    workspace = ROOT / ".mentor/test-sprint7-tamper"
    shutil.rmtree(workspace, ignore_errors=True)
    pipeline = adapter()
    batch = pipeline.fetch_user_batches({})[1]
    candidate = SyntheticCandidateGenerator().generate(batch, workspace / "candidate")
    approval = approve_candidate(candidate)
    with (candidate / "run_summary.md").open("a", encoding="utf-8") as handle:
        handle.write("tampered\n")
    store = CursorStore(workspace / "cursors.json")

    with pytest.raises(PipelineError) as error:
        publish_approved_candidate(
            ROOT,
            pipeline,
            store,
            batch,
            candidate,
            approval,
            workspace / "backup.json",
        )
    assert error.value.code == "CANDIDATE_TAMPERED"
    assert batch.user_id not in store.load().users


def test_invalid_review_or_database_error_does_not_advance_cursor() -> None:
    workspace = ROOT / ".mentor/test-sprint7-failures"
    shutil.rmtree(workspace, ignore_errors=True)
    pipeline = adapter()
    batch = pipeline.fetch_user_batches({})[0]
    candidate = SyntheticCandidateGenerator().generate(batch, workspace / "candidate")
    review_path = next((candidate / "reviews").glob("*.yaml"))
    review = yaml.safe_load(review_path.read_text(encoding="utf-8"))
    review["score"] = 99
    review_path.write_text(yaml.safe_dump(review), encoding="utf-8")
    store = CursorStore(workspace / "cursors.json")
    approval = approve_candidate(candidate)
    with pytest.raises(PipelineError):
        publish_approved_candidate(
            ROOT,
            pipeline,
            store,
            batch,
            candidate,
            approval,
            workspace / "backup-invalid.json",
        )
    assert batch.user_id not in store.load().users

    shutil.rmtree(candidate)
    candidate = SyntheticCandidateGenerator().generate(batch, candidate)
    pipeline.fail_publish = True
    with pytest.raises(PipelineError) as error:
        publish_approved_candidate(
            ROOT,
            pipeline,
            store,
            batch,
            candidate,
            approve_candidate(candidate),
            workspace / "backup-db-error.json",
        )
    assert error.value.code == "DATABASE_ERROR"
    assert batch.user_id not in store.load().users


def test_weekly_lock_rejects_a_concurrent_run() -> None:
    lock = ROOT / ".mentor/test-sprint7.lock"
    lock.unlink(missing_ok=True)
    with weekly_run_lock(lock), pytest.raises(PipelineError) as error, weekly_run_lock(lock):
        pass
    assert error.value.code == "WEEKLY_RUN_LOCKED"
