import pytest

from mentor_pipeline.content import validate_course, validate_curriculum
from mentor_pipeline.paths import repository_root
from mentor_pipeline.schema import SchemaValidationError, load_json, validate_json

ROOT = repository_root()


def test_valid_event_matches_schema() -> None:
    validate_json(
        load_json(ROOT / "fixtures/progress-event.valid.json"),
        ROOT / "schemas/progress-event.schema.json",
    )


def test_browser_encoded_golden_event_matches_python_contract() -> None:
    validate_json(
        load_json(ROOT / "fixtures/progress-event.browser.json"),
        ROOT / "schemas/progress-event.schema.json",
    )


def test_invalid_event_is_rejected() -> None:
    with pytest.raises(SchemaValidationError):
        validate_json(
            load_json(ROOT / "fixtures/progress-event.invalid.json"),
            ROOT / "schemas/progress-event.schema.json",
        )


def test_golden_course_has_valid_references_and_budget() -> None:
    course = validate_course(
        ROOT / "fixtures/course.valid.json", ROOT / "schemas/course.schema.json"
    )
    assert course["profile_id"] == "default"


def test_zero_to_data_analyst_curriculum_has_valid_prerequisite_graph() -> None:
    curriculum = validate_curriculum(
        ROOT / "content/curriculum/data-analyst-zero.yaml",
        ROOT / "schemas/curriculum.schema.json",
    )
    assert curriculum["persona"]["programming_experience"] == "none"
    assert curriculum["stages"][0]["id"] == "foundations.data-literacy"
    assert curriculum["stages"][-1]["id"] == "career.capstone"
