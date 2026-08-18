from __future__ import annotations

from pathlib import Path

from mentor_pipeline.paths import ensure_within_workspace

ALLOWED_CONTEXT = (
    "codex.md",
    "content/profile",
    "content/curriculum",
    "content/progress/summary.json",
    "content/progress/recent_mistakes.json",
    "content/progress/pending_reviews",
    "content/lessons",
    "content/cards",
    "content/tasks",
    "schemas",
    "fixtures",
    "technical_specification.md",
)


def build_prompt_file(root: Path, run_id: str) -> Path:
    root = ensure_within_workspace(root)
    staging = ensure_within_workspace(root / "staging" / "candidate" / run_id, root)
    staging.mkdir(parents=True, exist_ok=True)
    output = staging / "mentor-prompt.md"
    context = "\n".join(f"- `{item}`" for item in ALLOWED_CONTEXT)
    output.write_text(
        "# Weekly mentor run\n\n"
        "Read and follow `codex.md`. Use only the allowlisted context below. "
        f"Write candidate output only to `staging/candidate/{run_id}/`.\n\n"
        f"The pipeline resolved the exact bounded input set in "
        f"`staging/candidate/{run_id}/context-manifest.json`; do not read files absent from it. "
        "Do not modify the manifest or prompt.\n\n"
        f"## Allowed context\n\n{context}\n\n"
        "Analyze the current week's progress, review pending free responses, and prepare an "
        "evidence-based weekly report, control assignment, and the smallest useful next daily "
        "plan. A candidate task must include `learning_objective`, "
        "`prerequisites`, `answer_type`, `checker`, `rubric`, hints and reference_solution. "
        "A review must conform to `schemas/review.schema.json`. The daily plan must contain "
        "3–7 items. Do not write to the database. Finish only after writing run_summary.md, "
        "weekly_report.yaml, assignment.yaml, and daily_plan.yaml.\n",
        encoding="utf-8",
    )
    return output
