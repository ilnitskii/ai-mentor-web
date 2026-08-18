from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from pydantic import ValidationError

from mentor_pipeline.models import IngestResult, ProgressEvent
from mentor_pipeline.paths import MAX_EVENT_BYTES, ensure_within_workspace
from mentor_pipeline.report import atomic_write_bytes
from mentor_pipeline.schema import SchemaValidationError, load_json, validate_json


class EventConflictError(ValueError):
    pass


def canonical_digest(payload: dict) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


class EventLedger:
    def __init__(self, path: Path) -> None:
        ensure_within_workspace(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                digest TEXT NOT NULL,
                payload TEXT NOT NULL,
                ingested_at TEXT NOT NULL
            )
            """
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def record(self, event: ProgressEvent, raw: dict) -> str:
        digest = canonical_digest(raw)
        row = self.connection.execute(
            "SELECT digest FROM events WHERE event_id = ?", (event.event_id,)
        ).fetchone()
        if row:
            if row[0] == digest:
                return "duplicate"
            raise EventConflictError(f"Event id {event.event_id} has conflicting content")

        canonical = json.dumps(raw, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        self.connection.execute(
            "INSERT INTO events(event_id, digest, payload, ingested_at) VALUES (?, ?, ?, ?)",
            (event.event_id, digest, canonical, datetime.now(UTC).isoformat()),
        )
        self.connection.commit()
        return "accepted"

    def digest_for(self, event_id: str) -> str | None:
        row = self.connection.execute(
            "SELECT digest FROM events WHERE event_id = ?", (event_id,)
        ).fetchone()
        return row[0] if row else None


def _canonical_bytes(raw: dict) -> bytes:
    return (json.dumps(raw, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()


def _quarantine_copy(source: Path, quarantine: Path, prefix: str) -> None:
    target = quarantine / f"{prefix}-{source.name}"
    if target.exists() and target.read_bytes() == source.read_bytes():
        return
    if target.exists():
        digest = hashlib.sha256(source.read_bytes()).hexdigest()[:12]
        target = quarantine / f"{prefix}-{source.stem}-{digest}{source.suffix}"
    atomic_write_bytes(target, source.read_bytes())


def ingest_directory(
    source: Path,
    destination: Path,
    quarantine: Path,
    ledger_path: Path,
    schema_path: Path,
) -> IngestResult:
    for path in (source, destination, quarantine, ledger_path, schema_path):
        ensure_within_workspace(path)
    destination.mkdir(parents=True, exist_ok=True)
    quarantine.mkdir(parents=True, exist_ok=True)
    ledger = EventLedger(ledger_path)
    counts = {"accepted": 0, "duplicates": 0, "conflicts": 0, "invalid": 0}
    try:
        for path in sorted(source.rglob("*.json")):
            try:
                if path.is_symlink() or path.stat().st_size > MAX_EVENT_BYTES:
                    _quarantine_copy(path, quarantine, "oversized")
                    counts["invalid"] += 1
                    continue
                raw = load_json(path)
                validate_json(raw, schema_path)
                event = ProgressEvent.model_validate(raw)
                digest = canonical_digest(raw)
                known_digest = ledger.digest_for(event.event_id)
                if known_digest == digest:
                    counts["duplicates"] += 1
                    continue
                if known_digest is not None:
                    raise EventConflictError(f"Event id {event.event_id} has conflicting content")
                target = destination / f"{event.event_id}.json"
                if target.exists():
                    existing = load_json(target)
                    if canonical_digest(existing) != digest:
                        raise EventConflictError(
                            f"Destination has conflicting event {event.event_id}"
                        )
                else:
                    atomic_write_bytes(target, _canonical_bytes(raw))
                ledger.record(event, raw)
                counts["accepted"] += 1
            except EventConflictError:
                _quarantine_copy(path, quarantine, "conflict")
                counts["conflicts"] += 1
            except (SchemaValidationError, ValidationError, OSError, ValueError):
                _quarantine_copy(path, quarantine, "invalid")
                counts["invalid"] += 1
    finally:
        ledger.close()
    return IngestResult(**counts)
