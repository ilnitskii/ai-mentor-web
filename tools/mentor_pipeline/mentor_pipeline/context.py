from __future__ import annotations

import hashlib
import json
from pathlib import Path

from mentor_pipeline.errors import PipelineError
from mentor_pipeline.paths import ensure_within_workspace
from mentor_pipeline.prompt import ALLOWED_CONTEXT
from mentor_pipeline.report import atomic_write_bytes

MAX_CONTEXT_FILES = 500
MAX_CONTEXT_BYTES = 4 * 1024 * 1024
SNAPSHOT_EXCLUDED_ROOTS = {
    ".git",
    ".mentor",
    "node_modules",
    "venv",
}


def _files_for_entry(root: Path, relative: str) -> list[Path]:
    path = root / relative
    if path.is_symlink():
        raise PipelineError("CONTEXT_UNSAFE", "Context entry must not be a symlink", path=relative)
    if path.is_file():
        return [path]
    if not path.exists():
        return []
    return sorted(item for item in path.rglob("*") if item.is_file())


def build_context_manifest(root: Path, run_directory: Path) -> Path:
    """Resolve the codex.md allowlist to a size-bounded, auditable manifest."""
    root = ensure_within_workspace(root)
    run_directory = ensure_within_workspace(run_directory, root)
    entries: list[dict[str, str | int]] = []
    total = 0
    for allowed in ALLOWED_CONTEXT:
        for path in _files_for_entry(root, allowed):
            if path.is_symlink():
                raise PipelineError(
                    "CONTEXT_UNSAFE", "Context file must not be a symlink", path=str(path)
                )
            resolved = ensure_within_workspace(path, root)
            payload = resolved.read_bytes()
            total += len(payload)
            if len(entries) >= MAX_CONTEXT_FILES or total > MAX_CONTEXT_BYTES:
                raise PipelineError(
                    "CONTEXT_TOO_LARGE",
                    "Mentor context exceeds its deterministic bound",
                    files=len(entries) + 1,
                    bytes=total,
                )
            entries.append(
                {
                    "path": resolved.relative_to(root).as_posix(),
                    "bytes": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                }
            )
    if not any(item["path"] == "codex.md" for item in entries):
        raise PipelineError("BLOCKED_INPUT", "codex.md is missing from mentor context")
    manifest = {
        "schema_version": 1,
        "allowed_roots": list(ALLOWED_CONTEXT),
        "file_count": len(entries),
        "total_bytes": total,
        "files": entries,
    }
    output = run_directory / "context-manifest.json"
    atomic_write_bytes(
        output,
        (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(),
    )
    return output


def protected_workspace_snapshot(root: Path, candidate_directory: Path) -> dict[str, str]:
    """Fingerprint repository files that a mentor generation turn may not change."""
    root = ensure_within_workspace(root)
    candidate_directory = ensure_within_workspace(candidate_directory, root)
    snapshot: dict[str, str] = {}
    for path in root.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(root)
        if relative.parts[0] in SNAPSHOT_EXCLUDED_ROOTS:
            continue
        if "__pycache__" in relative.parts or path.name == ".DS_Store":
            continue
        if path == candidate_directory or candidate_directory in path.parents:
            continue
        snapshot[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return snapshot


def assert_workspace_unchanged(before: dict[str, str], after: dict[str, str]) -> None:
    changed = sorted(
        path for path in set(before) | set(after) if before.get(path) != after.get(path)
    )
    if changed:
        raise PipelineError(
            "CODEX_OUTPUT_VIOLATION",
            "Codex changed files outside its candidate directory",
            paths=changed[:20],
            changed_count=len(changed),
        )
