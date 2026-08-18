import shutil
from pathlib import Path

import pytest

from mentor_pipeline.candidate import validate_and_compile_candidate
from mentor_pipeline.errors import PipelineError
from mentor_pipeline.paths import repository_root

ROOT = repository_root()


def _candidate(directory: Path, *, moved_topic: bool = False) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "run_summary.md").write_text("# Run summary\n\nWeak first evidence.\n")
    (directory / "daily_plan.yaml").write_text(
        """date: 2026-08-18
target_minutes: 10
rationale: Низкая точность по foundations.data-tables требует короткого повторения.
items:
  - item_id: foundations.data-tables.card-001
    type: card
  - item_id: foundations.data-tables.card-002
    type: card
  - item_id: foundations.data-tables.task-choice
    type: task
""",
        encoding="utf-8",
    )
    if moved_topic:
        cards = directory / "cards"
        cards.mkdir()
        (cards / "changed.yaml").write_text(
            """schema_version: 1
cards:
  - id: foundations.data-tables.card-001
    topic_id: sql.window-functions
    prompt: Changed
    answer: Changed
    difficulty: easy
    status: active
""",
            encoding="utf-8",
        )


def test_candidate_rejects_stable_id_moved_to_another_topic() -> None:
    directory = ROOT / ".mentor/sprint6-candidate-invalid"
    shutil.rmtree(directory, ignore_errors=True)
    _candidate(directory, moved_topic=True)

    with pytest.raises(PipelineError, match="cannot move"):
        validate_and_compile_candidate(
            ROOT,
            directory,
            ROOT / "fixtures/course.valid.json",
            directory / "course.json",
        )
