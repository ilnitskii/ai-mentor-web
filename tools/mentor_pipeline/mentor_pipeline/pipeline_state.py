from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from mentor_pipeline.errors import PipelineError
from mentor_pipeline.paths import ensure_within_workspace
from mentor_pipeline.report import atomic_write_bytes
from mentor_pipeline.supabase_adapter import Cursor, PipelineAdapter

BACKUP_TABLES = ("weekly_reports", "assignments", "reviews")


class CursorDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: int = 1
    users: dict[str, Cursor] = Field(default_factory=dict)


class CursorStore:
    def __init__(self, path: Path) -> None:
        self.path = ensure_within_workspace(path)

    def load(self) -> CursorDocument:
        if not self.path.exists():
            return CursorDocument()
        return CursorDocument.model_validate_json(self.path.read_text(encoding="utf-8"))

    def save(self, document: CursorDocument) -> None:
        atomic_write_bytes(
            self.path,
            (json.dumps(document.model_dump(), indent=2, sort_keys=True) + "\n").encode(),
        )


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def create_pipeline_backup(adapter: PipelineAdapter, destination: Path) -> Path:
    destination = ensure_within_workspace(destination)
    tables = {table: adapter.read_table(table) for table in BACKUP_TABLES}
    digest = hashlib.sha256(_canonical_json(tables)).hexdigest()
    document = {
        "schema_version": 1,
        "tables": tables,
        "sha256": digest,
    }
    atomic_write_bytes(
        destination,
        (json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(),
    )
    destination.chmod(0o600)
    return destination


def restore_pipeline_backup(adapter: PipelineAdapter, source: Path) -> None:
    source = ensure_within_workspace(source)
    document = json.loads(source.read_text(encoding="utf-8"))
    if document.get("schema_version") != 1 or not isinstance(document.get("tables"), dict):
        raise PipelineError("BACKUP_INVALID", "Pipeline backup structure is invalid")
    tables = document["tables"]
    if set(tables) != set(BACKUP_TABLES):
        raise PipelineError("BACKUP_INVALID", "Pipeline backup table set is invalid")
    digest = hashlib.sha256(_canonical_json(tables)).hexdigest()
    if digest != document.get("sha256"):
        raise PipelineError("BACKUP_CHECKSUM_MISMATCH", "Pipeline backup checksum mismatch")
    for table in BACKUP_TABLES:
        rows = tables[table]
        if not isinstance(rows, list):
            raise PipelineError("BACKUP_INVALID", "Pipeline backup rows are invalid")
        adapter.upsert_rows(table, rows)
