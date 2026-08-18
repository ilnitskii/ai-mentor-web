import json
import shutil
from pathlib import Path

from mentor_pipeline.ingest import ingest_directory
from mentor_pipeline.paths import repository_root

ROOT = repository_root()


def test_ingest_is_idempotent_and_quarantines_conflict(tmp_path: Path) -> None:
    source = ROOT / ".mentor/test-source"
    destination = ROOT / ".mentor/test-raw"
    quarantine = ROOT / ".mentor/test-quarantine"
    ledger = ROOT / ".mentor/test-ledger.sqlite3"
    for directory in (source, destination, quarantine):
        directory.mkdir(parents=True, exist_ok=True)
    for path in (source, destination, quarantine):
        for child in path.glob("*"):
            child.unlink()
    ledger.unlink(missing_ok=True)

    fixture = json.loads((ROOT / "fixtures/progress-event.valid.json").read_text())
    event_path = source / "event.json"
    event_path.write_text(json.dumps(fixture), encoding="utf-8")
    first = ingest_directory(
        source,
        destination,
        quarantine,
        ledger,
        ROOT / "schemas/progress-event.schema.json",
    )
    second = ingest_directory(
        source,
        destination,
        quarantine,
        ledger,
        ROOT / "schemas/progress-event.schema.json",
    )
    fixture["payload"]["attempt"] = 2
    event_path.write_text(json.dumps(fixture), encoding="utf-8")
    conflict = ingest_directory(
        source,
        destination,
        quarantine,
        ledger,
        ROOT / "schemas/progress-event.schema.json",
    )

    assert first.accepted == 1
    assert second.duplicates == 1
    assert conflict.conflicts == 1
    assert (quarantine / "conflict-event.json").exists()


def test_one_thousand_events_can_be_reimported_without_duplicates() -> None:
    workspace = ROOT / ".mentor/ingest-1000"
    shutil.rmtree(workspace, ignore_errors=True)
    source = workspace / "source/device-01"
    destination = workspace / "raw"
    quarantine = workspace / "quarantine"
    ledger = workspace / "ledger.sqlite3"
    source.mkdir(parents=True)
    fixture = json.loads((ROOT / "fixtures/progress-event.valid.json").read_text())
    for index in range(1000):
        event = dict(fixture)
        event["event_id"] = f"0198-load-{index:04d}"
        (source / f"{index:04d}.json").write_text(json.dumps(event), encoding="utf-8")

    first = ingest_directory(
        workspace / "source",
        destination,
        quarantine,
        ledger,
        ROOT / "schemas/progress-event.schema.json",
    )
    second = ingest_directory(
        workspace / "source",
        destination,
        quarantine,
        ledger,
        ROOT / "schemas/progress-event.schema.json",
    )

    assert first.accepted == 1000
    assert second.duplicates == 1000
    assert len(list(destination.glob("*.json"))) == 1000
    assert not list(quarantine.glob("*.json"))
