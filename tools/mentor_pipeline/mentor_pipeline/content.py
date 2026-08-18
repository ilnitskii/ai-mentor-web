from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from mentor_pipeline.schema import SchemaValidationError, load_json, validate_json


def validate_curriculum(curriculum_path: Path, schema_path: Path) -> dict[str, Any]:
    try:
        curriculum = yaml.safe_load(curriculum_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        raise SchemaValidationError(f"Cannot read curriculum: {error}") from error
    validate_json(curriculum, schema_path)

    stages = curriculum["stages"]
    stage_ids = [stage["id"] for stage in stages]
    if len(stage_ids) != len(set(stage_ids)):
        raise SchemaValidationError("Curriculum stage IDs must be unique")
    known = set(stage_ids)
    for stage in stages:
        missing = set(stage["prerequisites"]) - known
        if missing:
            raise SchemaValidationError(
                f"Stage {stage['id']} has missing prerequisites: {sorted(missing)}"
            )

    dependencies = {stage["id"]: stage["prerequisites"] for stage in stages}
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(stage_id: str) -> None:
        if stage_id in visiting:
            raise SchemaValidationError(f"Curriculum prerequisite cycle at {stage_id}")
        if stage_id in visited:
            return
        visiting.add(stage_id)
        for prerequisite in dependencies[stage_id]:
            visit(prerequisite)
        visiting.remove(stage_id)
        visited.add(stage_id)

    for stage_id in stage_ids:
        visit(stage_id)
    return curriculum


def validate_course(course_path: Path, schema_path: Path) -> dict[str, Any]:
    course = load_json(course_path)
    return validate_course_data(course, schema_path)


def validate_course_data(course: dict[str, Any], schema_path: Path) -> dict[str, Any]:
    validate_json(course, schema_path)

    collections = {
        "topic": course["topics"],
        "lesson": course["lessons"],
        "card": course["cards"],
        "task": course["tasks"],
    }
    ids: dict[str, str] = {}
    for kind, items in collections.items():
        for item in items:
            item_id = item["id"]
            if item_id in ids:
                raise SchemaValidationError(
                    f"Duplicate content id {item_id!r} in {kind}; first seen in {ids[item_id]}"
                )
            ids[item_id] = kind

    topic_ids = {item["id"] for item in course["topics"]}
    for topic in course["topics"]:
        missing = set(topic["prerequisites"]) - topic_ids
        if missing:
            raise SchemaValidationError(
                f"Topic {topic['id']} has missing prerequisites: {sorted(missing)}"
            )
    for kind in ("lessons", "cards", "tasks"):
        for item in course[kind]:
            if item["topic_id"] not in topic_ids:
                raise SchemaValidationError(
                    f"{item['id']} references missing topic {item['topic_id']}"
                )
    lesson_ids = {item["id"] for item in course["lessons"]}
    for card in course["cards"]:
        source = card.get("source_lesson_id")
        if source is not None and source not in lesson_ids:
            raise SchemaValidationError(f"Card {card['id']} references missing lesson {source}")
        if card.get("type") in {"multiple_choice", "true_false", "sql_output_prediction"}:
            index = card.get("correct_choice_index")
            if index is None or index >= len(card.get("choices", [])):
                raise SchemaValidationError(f"Card {card['id']} has invalid correct choice")

    task_ids = {item["id"] for item in course["tasks"]}
    review_ids: set[str] = set()
    for review in course.get("reviews", []):
        if review["review_id"] in review_ids:
            raise SchemaValidationError(f"Duplicate review id {review['review_id']}")
        review_ids.add(review["review_id"])
        if review["task_id"] not in task_ids:
            raise SchemaValidationError(
                f"Review {review['review_id']} references missing task {review['task_id']}"
            )

    durations: dict[str, int] = {
        item["id"]: item.get("estimated_minutes", 1)
        for kind in ("lessons", "cards", "tasks")
        for item in course[kind]
    }
    for task in course["tasks"]:
        if sum(item["points"] for item in task["rubric"]) != 100:
            raise SchemaValidationError(f"Task {task['id']} rubric must total 100 points")

    plan = course["daily_plan"]
    for item in plan["items"]:
        actual_kind = ids.get(item["item_id"])
        if actual_kind is None:
            raise SchemaValidationError(f"Daily plan references missing item {item['item_id']}")
        if actual_kind != item["type"]:
            raise SchemaValidationError(
                f"Daily plan item {item['item_id']} declares {item['type']}, actual {actual_kind}"
            )
    total_minutes = sum(durations[item["item_id"]] for item in plan["items"])
    if total_minutes > plan["target_minutes"] * 1.1:
        raise SchemaValidationError(
            f"Daily plan estimates {total_minutes} minutes, over 110% of target "
            f"{plan['target_minutes']}"
        )
    return course
