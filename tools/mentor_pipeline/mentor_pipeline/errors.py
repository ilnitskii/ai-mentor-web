from __future__ import annotations

from typing import Any


class PipelineError(ValueError):
    """Expected contract failure with a stable machine-readable code."""

    def __init__(self, code: str, message: str, **details: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


ERROR_CODES = frozenset(
    {
        "ARCHIVE_CHECKSUM_MISMATCH",
        "ARCHIVE_DUPLICATE_PATH",
        "ARCHIVE_FILE_TOO_LARGE",
        "ARCHIVE_INVALID_MANIFEST",
        "ARCHIVE_MALFORMED",
        "ARCHIVE_MISSING_FILE",
        "ARCHIVE_TOO_LARGE",
        "ARCHIVE_TOO_MANY_FILES",
        "ARCHIVE_UNSAFE_ENTRY",
        "CONTENT_INVALID",
        "EVENT_CONFLICT",
        "EVENT_INVALID",
        "EVENT_TOO_LARGE",
        "IO_ERROR",
        "BLOCKED_INPUT",
        "BACKUP_CHECKSUM_MISMATCH",
        "BACKUP_INVALID",
        "BACKUP_TABLE_DENIED",
        "BATCH_TOO_LARGE",
        "CANDIDATE_TAMPERED",
        "CODEX_RUN_FAILED",
        "CODEX_OUTPUT_VIOLATION",
        "CONTEXT_TOO_LARGE",
        "CONTEXT_UNSAFE",
        "DAILY_RUN_LOCKED",
        "DATABASE_ERROR",
        "CONFIG_INVALID",
        "DOCTOR_FAILED",
        "PIPELINE_FAILED",
        "PUBLISH_FAILED",
        "RUN_STATE_INVALID",
        "SCHEMA_INVALID",
        "VALIDATION_FAILED",
        "WEEKLY_RUN_LOCKED",
    }
)
