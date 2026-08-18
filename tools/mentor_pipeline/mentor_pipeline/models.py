from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProgressEvent(StrictModel):
    schema_version: Literal[1]
    event_id: str
    user_id: str
    device_id: str
    profile_id: str
    item_id: str
    event_type: Literal[
        "lesson_completed",
        "card_reviewed",
        "task_submitted",
        "plan_completed",
        "mistake_corrected",
    ]
    occurred_at: datetime
    timezone: str
    payload: dict[str, Any]


class IngestResult(StrictModel):
    accepted: int = 0
    duplicates: int = 0
    conflicts: int = 0
    invalid: int = 0
