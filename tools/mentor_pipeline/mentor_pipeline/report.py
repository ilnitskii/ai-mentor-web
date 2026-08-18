from __future__ import annotations

import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RunReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    run_id: str
    command: str
    status: Literal["succeeded", "failed"]
    started_at: datetime
    finished_at: datetime
    counts: dict[str, int] = Field(default_factory=dict)
    error_code: str | None = None
    message: str | None = None


def atomic_write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def write_run_report(path: Path, report: RunReport) -> None:
    payload = (
        json.dumps(report.model_dump(mode="json"), ensure_ascii=False, indent=2) + "\n"
    ).encode()
    atomic_write_bytes(path, payload)


def make_report(
    command: str,
    status: Literal["succeeded", "failed"],
    started_at: datetime,
    *,
    counts: dict[str, int] | None = None,
    error_code: str | None = None,
    message: str | None = None,
    run_id: str | None = None,
) -> RunReport:
    now = datetime.now(UTC)
    return RunReport(
        run_id=run_id or f"{command}-{now.strftime('%Y%m%dT%H%M%S%fZ')}",
        command=command,
        status=status,
        started_at=started_at,
        finished_at=now,
        counts=counts or {},
        error_code=error_code,
        message=message,
    )
