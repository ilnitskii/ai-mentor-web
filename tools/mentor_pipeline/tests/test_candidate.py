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
    (directory / "weekly_report.yaml").write_text(
        """schema_version: 1
report_id: weekly.synthetic.2026-08-18
period_start: '2026-08-10'
period_end: '2026-08-16'
summary: Synthetic evidence summary.
improvements: []
weak_topics:
  - topic_id: foundations.data-tables
    evidence: One synthetic incorrect answer.
    action: Repeat one independent task.
next_focus: Table grain.
""",
        encoding="utf-8",
    )
    (directory / "assignment.yaml").write_text(
        """schema_version: 1
assignment_id: assignment.synthetic.2026-08-18
report_id: weekly.synthetic.2026-08-18
title: Synthetic control
estimated_minutes: 25
task_ids:
  - foundations.data-tables.task-choice
  - foundations.data-tables.task-number
  - foundations.data-tables.task-quality
  - foundations.data-tables.task-text
rationale: Verify the evidenced weak topic independently.
""",
        encoding="utf-8",
    )
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
