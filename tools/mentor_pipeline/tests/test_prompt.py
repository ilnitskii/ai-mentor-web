from mentor_pipeline.paths import repository_root
from mentor_pipeline.prompt import ALLOWED_CONTEXT, build_prompt_file


def test_prompt_excludes_raw_progress() -> None:
    root = repository_root()
    prompt = build_prompt_file(root, "pytest-run")
    text = prompt.read_text(encoding="utf-8")

    assert "content/progress/raw" not in ALLOWED_CONTEXT
    assert "content/progress/raw" not in text
    assert "staging/candidate/pytest-run/" in text
