from __future__ import annotations

import difflib
import hashlib
import json
import re
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from mentor_pipeline.content import validate_course_data
from mentor_pipeline.errors import PipelineError
from mentor_pipeline.paths import ensure_within_workspace
from mentor_pipeline.report import atomic_write_bytes
from mentor_pipeline.schema import SchemaValidationError, load_json, validate_json

ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
PIPELINE_FILES = {
    "mentor-prompt.md",
    "context-manifest.json",
    "codex-result.json",
    "codex-last-message.txt",
    "policy-report.json",
    "candidate-course.json",
    "candidate.diff",
}


def _yaml(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        raise PipelineError(
            "VALIDATION_FAILED", f"Cannot read YAML {path.name}: {error}"
        ) from error


def _markdown_lesson(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise PipelineError(
            "VALIDATION_FAILED", "Lesson requires YAML front matter", path=path.name
        )
    try:
        _, raw_front, body = text.split("---\n", 2)
        front = yaml.safe_load(raw_front)
    except (ValueError, yaml.YAMLError) as error:
        raise PipelineError(
            "VALIDATION_FAILED", f"Invalid lesson front matter: {path.name}"
        ) from error
    if not isinstance(front, dict) or not body.strip():
        raise PipelineError("VALIDATION_FAILED", f"Incomplete lesson: {path.name}")
    lesson = {
        key: front[key]
        for key in ("id", "topic_id", "title", "estimated_minutes", "check", "status")
        if key in front
    }
    lesson["body"] = body.strip()
    lesson.setdefault("status", "active")
    return lesson


def _items(directory: Path, collection_key: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    if not directory.exists():
        return result
    for path in sorted(directory.iterdir()):
        if path.is_symlink() or path.suffix.lower() not in {".yaml", ".yml", ".json"}:
            raise PipelineError("VALIDATION_FAILED", "Unexpected candidate file", path=str(path))
        value = load_json(path) if path.suffix.lower() == ".json" else _yaml(path)
        if isinstance(value, dict) and collection_key in value:
            value = value[collection_key]
        elif isinstance(value, dict):
            value = [value]
        if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
            raise PipelineError(
                "VALIDATION_FAILED", f"Invalid {collection_key} file", path=path.name
            )
        result.extend(value)
    return result


def _normalize_card(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": raw.get("id"),
        "topic_id": raw.get("topic_id"),
        "prompt": raw.get("prompt"),
        "answer": raw.get("answer"),
        "type": raw.get("type", "question_answer"),
        "choices": raw.get("choices", []),
        "correct_choice_index": raw.get("correct_choice_index"),
        "explanation": raw.get("explanation", ""),
        "source_lesson_id": raw.get("source_lesson_id"),
        "difficulty": raw.get("difficulty"),
        "status": raw.get("status", "active"),
    }


def _normalize_task(raw: dict[str, Any]) -> dict[str, Any]:
    answer_type = raw.get("answer_type", raw.get("type", "text"))
    checker = raw.get("checker")
    reference = str(raw.get("reference_solution", ""))
    if checker is None:
        mode = "pending_review"
        answers: list[str] = []
        if answer_type == "choice":
            mode, answers = "exact", [reference.removesuffix(".")]
        elif answer_type == "number":
            mode, answers = "normalized", [reference]
        checker = {"mode": mode, "expected_answers": answers}
    return {
        "id": raw.get("id"),
        "topic_id": raw.get("topic_id"),
        "prompt": raw.get("prompt"),
        "answer_type": answer_type,
        "options": raw.get("options", []),
        "checker": checker,
        "difficulty": raw.get("difficulty"),
        "estimated_minutes": raw.get("estimated_minutes"),
        "hints": raw.get("hints", []),
        "reference_solution": raw.get("reference_solution"),
        "rubric": raw.get("rubric", []),
        "status": raw.get("status", "active"),
    }


def _merge(base: list[dict[str, Any]], candidate: list[dict[str, Any]]) -> list[dict[str, Any]]:
    replacements = {item["id"]: item for item in candidate}
    result = [replacements.pop(item["id"], item) for item in base]
    result.extend(replacements[key] for key in sorted(replacements))
    return result


def _profile_budget(root: Path) -> int:
    profiles = sorted((root / "content/profile").glob("*.yaml"))
    if not profiles:
        raise PipelineError("BLOCKED_INPUT", "A mentor profile is required")
    profile = _yaml(profiles[0])
    try:
        return int(profile["daily_minutes"])
    except (KeyError, TypeError, ValueError) as error:
        raise PipelineError("BLOCKED_INPUT", "Profile daily_minutes is required") from error


def _validate_identity(
    base: dict[str, Any], kind: str, candidates: list[dict[str, Any]], all_ids: set[str]
) -> None:
    by_id = {item["id"]: item for item in base[f"{kind}s"]}
    seen: set[str] = set()
    for item in candidates:
        item_id = item.get("id")
        if not isinstance(item_id, str) or not ID_PATTERN.fullmatch(item_id) or "." not in item_id:
            raise PipelineError("VALIDATION_FAILED", f"Invalid namespaced {kind} ID", id=item_id)
        if item_id in seen:
            raise PipelineError("VALIDATION_FAILED", f"Duplicate candidate ID {item_id}")
        seen.add(item_id)
        if item_id in all_ids and item_id not in by_id:
            raise PipelineError("VALIDATION_FAILED", f"ID {item_id} changes entity kind")
        previous = by_id.get(item_id)
        if previous and previous.get("topic_id") != item.get("topic_id"):
            raise PipelineError(
                "VALIDATION_FAILED", f"Stable ID {item_id} cannot move to another topic"
            )


def _policy_report(course: dict[str, Any], summary: dict[str, Any]) -> dict[str, Any]:
    evidence = {item["topic_id"]: item for item in summary.get("topics", [])}
    item_topics = {
        item["id"]: item["topic_id"]
        for key in ("lessons", "cards", "tasks")
        for item in course[key]
    }
    planned_topics = sorted(
        {item_topics[item["item_id"]] for item in course["daily_plan"]["items"]}
    )
    decisions = []
    for topic_id, item in sorted(evidence.items()):
        mastery = int(item.get("mastery", 0))
        accuracy = item.get("recent_accuracy")
        if topic_id in planned_topics:
            reason = (
                "weak_recent_evidence"
                if mastery < 60 or (accuracy is not None and accuracy < 0.7)
                else "scheduled_maintenance"
            )
        elif mastery >= 85:
            reason = "mastery_at_least_85_no_fresh_failure"
        else:
            reason = "not_selected_within_daily_budget"
        decisions.append(
            {
                "topic_id": topic_id,
                "mastery": mastery,
                "recent_accuracy": accuracy,
                "decision": reason,
            }
        )
    return {
        "schema_version": 1,
        "planned_topics": planned_topics,
        "decisions": decisions,
        "new_plan_rationale": course["daily_plan"]["rationale"],
    }


def _validate_adaptation(course: dict[str, Any], summary: dict[str, Any]) -> None:
    mastery = {item["topic_id"]: int(item.get("mastery", 0)) for item in summary.get("topics", [])}
    evidence = {
        item["topic_id"]: item
        for item in summary.get("topics", [])
        if int(item.get("evidence_count", 0)) > 0
    }
    item_topics = {
        item["id"]: item["topic_id"]
        for key in ("lessons", "cards", "tasks")
        for item in course[key]
    }
    planned_topics = {item_topics[item["item_id"]] for item in course["daily_plan"]["items"]}
    course_topics = {item["id"] for item in course["topics"]}
    weak = {
        topic_id
        for topic_id, item in evidence.items()
        if topic_id in course_topics
        and (
            mastery[topic_id] < 60
            or (item.get("recent_accuracy") is not None and float(item["recent_accuracy"]) < 0.7)
        )
    }
    if weak and not weak.intersection(planned_topics):
        raise PipelineError(
            "VALIDATION_FAILED",
            "Daily plan must include at least one evidenced weak topic",
            weak_topics=sorted(weak),
        )
    prerequisites = {item["id"]: item["prerequisites"] for item in course["topics"]}
    for topic_id in planned_topics:
        blocked = [item for item in prerequisites[topic_id] if mastery.get(item, 0) < 60]
        if blocked:
            raise PipelineError(
                "VALIDATION_FAILED",
                "Daily plan violates topic prerequisites",
                topic_id=topic_id,
                blocked_by=blocked,
            )


def validate_and_compile_candidate(
    root: Path,
    candidate_directory: Path,
    base_course_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    root = ensure_within_workspace(root)
    candidate_directory = ensure_within_workspace(candidate_directory, root)
    base_course_path = ensure_within_workspace(base_course_path, root)
    output_path = ensure_within_workspace(output_path, root)
    base = load_json(base_course_path)
    validate_course_data(base, root / "schemas/course.schema.json")

    allowed_top = {
        "run_summary.md",
        "weekly_report.yaml",
        "weekly_report.yml",
        "assignment.yaml",
        "assignment.yml",
        "daily_plan.yaml",
        "daily_plan.yml",
        "lessons",
        "cards",
        "tasks",
        "reviews",
    } | PIPELINE_FILES
    unexpected = sorted(
        path.name for path in candidate_directory.iterdir() if path.name not in allowed_top
    )
    if unexpected:
        raise PipelineError("VALIDATION_FAILED", "Unexpected candidate output", paths=unexpected)
    summary_path = candidate_directory / "run_summary.md"
    if not summary_path.is_file() or not summary_path.read_text(encoding="utf-8").strip():
        raise PipelineError("VALIDATION_FAILED", "run_summary.md is required")
    report_path = next(
        (
            path
            for path in (
                candidate_directory / "weekly_report.yaml",
                candidate_directory / "weekly_report.yml",
            )
            if path.is_file()
        ),
        None,
    )
    assignment_path = next(
        (
            path
            for path in (
                candidate_directory / "assignment.yaml",
                candidate_directory / "assignment.yml",
            )
            if path.is_file()
        ),
        None,
    )
    if report_path is None or assignment_path is None:
        raise PipelineError("VALIDATION_FAILED", "weekly report and assignment are required")
    weekly_report = _yaml(report_path)
    assignment = _yaml(assignment_path)
    validate_json(weekly_report, root / "schemas/weekly-report.schema.json")
    validate_json(assignment, root / "schemas/assignment.schema.json")
    if assignment["report_id"] != weekly_report["report_id"]:
        raise PipelineError("VALIDATION_FAILED", "Assignment must reference its weekly report")
    if date.fromisoformat(weekly_report["period_end"]) < date.fromisoformat(
        weekly_report["period_start"]
    ):
        raise PipelineError("VALIDATION_FAILED", "Weekly report period is invalid")
    plan_paths = [candidate_directory / "daily_plan.yaml", candidate_directory / "daily_plan.yml"]
    plan_path = next((path for path in plan_paths if path.is_file()), None)
    if plan_path is None:
        raise PipelineError("VALIDATION_FAILED", "daily_plan.yaml is required")
    plan = _yaml(plan_path)
    if isinstance(plan, dict) and "daily_plan" in plan:
        plan = plan["daily_plan"]
    if not isinstance(plan, dict):
        raise PipelineError("VALIDATION_FAILED", "daily_plan.yaml must contain an object")
    if isinstance(plan.get("date"), date):
        plan["date"] = plan["date"].isoformat()

    lessons = []
    lesson_dir = candidate_directory / "lessons"
    if lesson_dir.exists():
        for path in sorted(lesson_dir.iterdir()):
            if path.is_symlink() or path.suffix.lower() != ".md":
                raise PipelineError("VALIDATION_FAILED", "Unexpected lesson file", path=str(path))
            lessons.append(_markdown_lesson(path))
    cards = [_normalize_card(item) for item in _items(candidate_directory / "cards", "cards")]
    raw_tasks = _items(candidate_directory / "tasks", "tasks")
    known_topics = {item["id"] for item in base["topics"]}
    for raw in raw_tasks:
        missing_fields = {"learning_objective", "prerequisites"} - set(raw)
        if missing_fields:
            raise PipelineError(
                "VALIDATION_FAILED",
                "Candidate tasks require learning_objective and prerequisites",
                task_id=raw.get("id"),
                missing=sorted(missing_fields),
            )
        missing_prerequisites = set(raw["prerequisites"]) - known_topics
        if missing_prerequisites:
            raise PipelineError(
                "VALIDATION_FAILED",
                "Task references unknown prerequisites",
                task_id=raw.get("id"),
                missing=sorted(missing_prerequisites),
            )
    tasks = [_normalize_task(item) for item in raw_tasks]

    all_ids = {item["id"] for key in ("topics", "lessons", "cards", "tasks") for item in base[key]}
    _validate_identity(base, "lesson", lessons, all_ids)
    _validate_identity(base, "card", cards, all_ids)
    _validate_identity(base, "task", tasks, all_ids)
    if sum(item["id"] not in all_ids for item in cards) > 10:
        raise PipelineError("VALIDATION_FAILED", "A mentor run may add at most 10 cards")
    if sum(item["id"] not in all_ids for item in lessons) > 1:
        raise PipelineError("VALIDATION_FAILED", "A daily plan may add at most one lesson")

    course = dict(base)
    course["lessons"] = _merge(base["lessons"], lessons)
    course["cards"] = _merge(base["cards"], cards)
    course["tasks"] = _merge(base["tasks"], tasks)
    course["daily_plan"] = plan
    known_task_ids = {item["id"] for item in course["tasks"]}
    unknown_assignment_tasks = set(assignment["task_ids"]) - known_task_ids
    if unknown_assignment_tasks:
        raise PipelineError(
            "VALIDATION_FAILED",
            "Assignment references unknown tasks",
            task_ids=sorted(unknown_assignment_tasks),
        )

    reviews: list[dict[str, Any]] = []
    for review in _items(candidate_directory / "reviews", "reviews"):
        validate_json(review, root / "schemas/review.schema.json")
        possible = sum(item["points_possible"] for item in review["criteria"])
        awarded = sum(item["points_awarded"] for item in review["criteria"])
        if possible != 100 or awarded != review["score"]:
            raise PipelineError(
                "VALIDATION_FAILED",
                "Review criteria must total 100 and match score",
                review_id=review["review_id"],
            )
        reviews.append(review)
    if reviews:
        existing_reviews = {item["review_id"]: item for item in base.get("reviews", [])}
        existing_reviews.update({item["review_id"]: item for item in reviews})
        course["reviews"] = [existing_reviews[key] for key in sorted(existing_reviews)]

    try:
        validate_course_data(course, root / "schemas/course.schema.json")
    except SchemaValidationError as error:
        raise PipelineError("VALIDATION_FAILED", str(error)) from error

    items = course["daily_plan"]["items"]
    if not 3 <= len(items) <= 7:
        raise PipelineError("VALIDATION_FAILED", "Daily plan must contain 3 to 7 items")
    budget = _profile_budget(root)
    if course["daily_plan"]["target_minutes"] > budget * 1.1:
        raise PipelineError("VALIDATION_FAILED", "Daily plan target exceeds profile budget")
    lesson_ids = {item["id"] for item in course["lessons"]}
    if sum(item["item_id"] in lesson_ids for item in items) > 1:
        raise PipelineError("VALIDATION_FAILED", "Daily plan may contain at most one lesson")
    hard_tasks = {item["id"] for item in course["tasks"] if item["difficulty"] == "hard"}
    if sum(item["item_id"] in hard_tasks for item in items) > 2:
        raise PipelineError("VALIDATION_FAILED", "Daily plan may contain at most two hard tasks")
    duration = {
        item["id"]: item.get("estimated_minutes", 1)
        for key in ("lessons", "cards", "tasks")
        for item in course[key]
    }
    estimated_total = sum(duration[item["item_id"]] for item in items)
    reading = sum(duration[item["item_id"]] for item in items if item["type"] == "lesson")
    active = estimated_total - reading
    if estimated_total and reading / estimated_total > 0.4:
        raise PipelineError("VALIDATION_FAILED", "Reading may use at most 40% of plan time")
    if estimated_total and active / estimated_total < 0.4:
        raise PipelineError(
            "VALIDATION_FAILED", "Active practice must use at least 40% of plan time"
        )

    progress_summary = load_json(root / "content/progress/summary.json")
    _validate_adaptation(course, progress_summary)
    report = _policy_report(course, progress_summary)
    atomic_write_bytes(
        candidate_directory / "policy-report.json",
        (json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(),
    )
    atomic_write_bytes(
        output_path,
        (json.dumps(course, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(),
    )
    return course


def write_candidate_diff(base_path: Path, candidate_path: Path, output_path: Path) -> None:
    before = base_path.read_text(encoding="utf-8").splitlines(keepends=True)
    after = candidate_path.read_text(encoding="utf-8").splitlines(keepends=True)
    diff = "".join(
        difflib.unified_diff(
            before, after, fromfile="published/course.json", tofile="candidate/course.json"
        )
    )
    atomic_write_bytes(output_path, diff.encode())


def directory_digest(directory: Path) -> str:
    digest = hashlib.sha256()
    ignored = PIPELINE_FILES | {"mentor-prompt.md", "context-manifest.json"}
    for path in sorted(item for item in directory.rglob("*") if item.is_file()):
        if path.name in ignored:
            continue
        digest.update(path.relative_to(directory).as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()
