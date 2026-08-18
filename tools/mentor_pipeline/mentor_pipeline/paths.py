from __future__ import annotations

from pathlib import Path

MAX_EVENT_BYTES = 256 * 1024


def repository_root() -> Path:
    return Path(__file__).resolve().parents[3]


def ensure_within_workspace(path: Path, root: Path | None = None) -> Path:
    workspace = (root or repository_root()).resolve()
    resolved = path.resolve()
    if resolved != workspace and workspace not in resolved.parents:
        raise ValueError(f"Path is outside workspace: {path}")
    return resolved
