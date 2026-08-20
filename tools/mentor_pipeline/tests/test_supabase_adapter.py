import json
import shutil

import pytest

from mentor_pipeline.errors import PipelineError
from mentor_pipeline.paths import repository_root
from mentor_pipeline.pipeline_state import (
    CursorDocument,
    CursorStore,
    create_pipeline_backup,
    restore_pipeline_backup,
)
from mentor_pipeline.supabase_adapter import (
    Cursor,
    FakePipelineAdapter,
    PipelineConfig,
)
from mentor_pipeline.weekly import run_weekly_dry_run

ROOT = repository_root()
FIXTURE = ROOT / "fixtures/pipeline-source.synthetic.json"


def fake_adapter() -> FakePipelineAdapter:
    source = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return FakePipelineAdapter(
        profiles=source["profiles"],
        events=source["events"],
        pending_reviews=source["pending_reviews"],
        tables=source["tables"],
    )


def test_environment_validation_redacts_secret() -> None:
    secret = "sb_secret_synthetic_never_log_this_value"
    config = PipelineConfig.from_environment(
        {"SUPABASE_URL": "https://synthetic.supabase.co", "SUPABASE_SECRET_KEY": secret}
    )
    assert secret not in repr(config)
    with pytest.raises(PipelineError, match="incomplete or invalid") as error:
        PipelineConfig.from_environment({})
    assert error.value.code == "CONFIG_INVALID"


def test_fake_adapter_separates_users_and_respects_cursor() -> None:
    adapter = fake_adapter()
    batches = adapter.fetch_user_batches(
        {
            "10000000-0000-4000-8000-000000000001": Cursor(
                received_at="2026-08-18T08:00:01Z",
                event_id="71000000-0000-4000-8000-000000000001",
            )
        }
    )
    alice, bob = batches
    assert alice.events == []
    assert len(alice.pending_reviews) == 1
    assert {item["user_id"] for item in bob.events} == {bob.user_id}
    assert bob.pending_reviews == []


def test_dry_run_logs_ids_and_counts_without_answers_or_cursor_movement() -> None:
    workspace = ROOT / ".mentor/test-sprint6-dry-run"
    shutil.rmtree(workspace, ignore_errors=True)
    store = CursorStore(workspace / "cursors.json")
    initial = CursorDocument(
        users={
            "10000000-0000-4000-8000-000000000001": Cursor(
                received_at="2026-08-17T00:00:00Z"
            )
        }
    )
    store.save(initial)

    report = run_weekly_dry_run(fake_adapter(), store, workspace / "run")

    serialized = json.dumps(report, ensure_ascii=False)
    assert report["user_count"] == 2
    assert report["remote_writes"] == 0
    assert report["cursor_advanced"] is False
    assert "71000000-0000-4000-8000-000000000001" in serialized
    assert "Synthetic private Alice answer" not in serialized
    assert store.load() == initial


def test_backup_restores_allowlisted_tables_and_detects_tampering() -> None:
    workspace = ROOT / ".mentor/test-sprint6-backup"
    shutil.rmtree(workspace, ignore_errors=True)
    adapter = fake_adapter()
    adapter.tables["weekly_reports"] = [{"report_id": "synthetic-report"}]
    backup = create_pipeline_backup(adapter, workspace / "backup.json")
    adapter.tables["weekly_reports"] = []

    restore_pipeline_backup(adapter, backup)
    assert adapter.tables["weekly_reports"] == [{"report_id": "synthetic-report"}]
    assert backup.stat().st_mode & 0o777 == 0o600

    document = json.loads(backup.read_text(encoding="utf-8"))
    document["tables"]["weekly_reports"] = []
    backup.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(PipelineError) as error:
        restore_pipeline_backup(adapter, backup)
    assert error.value.code == "BACKUP_CHECKSUM_MISMATCH"


def test_database_error_does_not_move_cursor() -> None:
    workspace = ROOT / ".mentor/test-sprint6-db-error"
    shutil.rmtree(workspace, ignore_errors=True)
    store = CursorStore(workspace / "cursors.json")
    initial = CursorDocument(users={"synthetic-user": Cursor(event_id="before")})
    store.save(initial)
    adapter = fake_adapter()
    adapter.fail_reads = True

    with pytest.raises(PipelineError) as error:
        run_weekly_dry_run(adapter, store, workspace / "run")
    assert error.value.code == "DATABASE_ERROR"
    assert store.load() == initial
