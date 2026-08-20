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
from mentor_pipeline.pipeline_state import CursorStore
from mentor_pipeline.prompt import build_prompt_file
from mentor_pipeline.report import make_report, write_run_report
from mentor_pipeline.schema import load_json, validate_json
from mentor_pipeline.supabase_adapter import (
    FakePipelineAdapter,
    PipelineConfig,
    SupabasePipelineAdapter,
)
from mentor_pipeline.weekly import run_weekly_dry_run
from mentor_pipeline.weekly_orchestrator import (
    approve_candidate,
    quarantine_candidate,
)

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


@app.command("weekly-dry-run")
def weekly_dry_run(
    run_id: str | None = None,
    fake_source: Annotated[Path | None, typer.Option("--fake-source")] = None,
) -> None:
    """Fetch isolated user batches and aggregate locally without Codex or DB writes."""
    resolved = run_id or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_directory = ROOT / ".mentor/runs" / resolved
    if run_directory.exists():
        raise typer.BadParameter("run_id already exists")
    if fake_source is not None:
        source = load_json(_path(fake_source))
        adapter = FakePipelineAdapter(
            profiles=source["profiles"],
            events=source["events"],
            pending_reviews=source["pending_reviews"],
            tables=source["tables"],
        )
    else:
        adapter = SupabasePipelineAdapter(PipelineConfig.from_environment())
    report = run_weekly_dry_run(
        adapter,
        CursorStore(ROOT / ".mentor/pipeline/cursors.json"),
        run_directory,
    )
    table = Table("User ref", "Events", "Pending reviews", "Event IDs")
    for user in report["users"]:
        table.add_row(
            str(user["user_ref"]),
            str(user["event_count"]),
            str(user["pending_review_count"]),
            ", ".join(user["event_ids"]),
        )
    console.print(table)
    console.print(
        f"[green]dry-run complete[/green] users={report['user_count']} "
        f"remote_writes={report['remote_writes']} cursor_advanced={report['cursor_advanced']}"
    )


@app.command("candidate-digest")
def candidate_digest(path: Path) -> None:
    """Print the manual-approval digest for one validated candidate directory."""
    approval = approve_candidate(_path(path))
    console.print(approval.digest)


@app.command("quarantine-candidate")
def quarantine_candidate_command(
    path: Path,
    destination: Path = Path(".mentor/quarantine"),
) -> None:
    """Move a rejected candidate into the local ignored quarantine area."""
    quarantined = quarantine_candidate(_path(path), _path(destination))
    console.print(f"[yellow]quarantined[/yellow] {quarantined.relative_to(ROOT)}")
