from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from mentor_pipeline.aggregate import aggregate_events
from mentor_pipeline.content import validate_course, validate_curriculum
from mentor_pipeline.doctor import run_doctor
from mentor_pipeline.ingest import ingest_directory
from mentor_pipeline.paths import repository_root
from mentor_pipeline.prompt import build_prompt_file
from mentor_pipeline.report import make_report, write_run_report
from mentor_pipeline.schema import load_json, validate_json

app = typer.Typer(no_args_is_help=True, help="AI Mentor deterministic content pipeline")
console = Console()
ROOT = repository_root()


def _path(value: Path) -> Path:
    return value if value.is_absolute() else ROOT / value


@app.command("doctor")
def doctor(as_json: Annotated[bool, typer.Option("--json")] = False) -> None:
    """Inspect the local toolchain without changing external state."""
    checks = run_doctor(ROOT)
    if as_json:
        typer.echo(json.dumps(checks, ensure_ascii=False, indent=2))
        return
    table = Table("Check", "Status", "Detail")
    for check in checks:
        table.add_row(str(check["name"]), "OK" if check["ok"] else "BLOCKED", str(check["detail"]))
    console.print(table)


@app.command("validate-event")
def validate_event(path: Path) -> None:
    """Validate one immutable progress event against schema v1."""
    validate_json(load_json(_path(path)), ROOT / "schemas/progress-event.schema.json")
    console.print(f"[green]valid[/green] {_path(path)}")


@app.command("validate-content")
def validate_content(path: Path) -> None:
    """Validate a normalized course and all cross-references."""
    course = validate_course(_path(path), ROOT / "schemas/course.schema.json")
    count = sum(len(course[key]) for key in ("topics", "lessons", "cards", "tasks"))
    console.print(f"[green]valid[/green] {_path(path)} ({count} entities)")


@app.command("validate-curriculum")
def validate_curriculum_command(
    path: Path = Path("content/curriculum/data-analyst-zero.yaml"),
) -> None:
    """Validate the canonical track and its prerequisite graph."""
    curriculum = validate_curriculum(_path(path), ROOT / "schemas/curriculum.schema.json")
    console.print(f"[green]valid[/green] {_path(path)} ({len(curriculum['stages'])} stages)")


@app.command("ingest")
def ingest(
    source: Path,
    destination: Path = Path("content/progress/raw"),
    quarantine: Path = Path("content/progress/quarantine"),
    ledger: Path = Path(".mentor/ingest.sqlite3"),
    report: Annotated[Path | None, typer.Option("--report")] = None,
) -> None:
    """Idempotently import exported event files into the local analysis workspace."""
    started = datetime.now(UTC)
    result = ingest_directory(
        _path(source),
        _path(destination),
        _path(quarantine),
        _path(ledger),
        ROOT / "schemas/progress-event.schema.json",
    )
    if report is not None:
        write_run_report(
            _path(report),
            make_report(
                "ingest",
                "succeeded",
                started,
                counts={key: int(value) for key, value in result.model_dump().items()},
            ),
        )
    console.print(result.model_dump_json(indent=2))


@app.command("aggregate")
@app.command("aggregate-progress")
def aggregate_progress(
    source: Path = Path("content/progress/raw"),
    output: Path = Path("content/progress/summary.json"),
    profile_id: str = "default",
) -> None:
    """Create bounded progress context for a mentor run."""
    summary = aggregate_events(_path(source), _path(output), profile_id)
    console.print(json.dumps(summary, ensure_ascii=False, indent=2))


@app.command("prepare-mentor-run")
def prepare_mentor_run(run_id: str | None = None) -> None:
    """Create the bounded prompt for review before invoking Codex."""
    resolved = run_id or datetime.now().strftime("%Y%m%d-%H%M%S")
    prompt = build_prompt_file(ROOT, resolved)
    console.print(f"[green]prepared[/green] {prompt}")

