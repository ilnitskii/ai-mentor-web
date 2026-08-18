from __future__ import annotations

import importlib.metadata
import shutil
import subprocess
import sys
from pathlib import Path


def _command_version(command: str, args: list[str]) -> tuple[bool, str]:
    executable = shutil.which(command)
    if not executable:
        return False, "not found"
    try:
        result = subprocess.run(
            [executable, *args], capture_output=True, text=True, check=False, timeout=10
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return False, str(error)
    output = (result.stdout or result.stderr).strip().splitlines()
    return result.returncode == 0, output[0] if output else f"exit {result.returncode}"


def run_doctor(root: Path) -> list[dict[str, str | bool]]:
    checks: list[dict[str, str | bool]] = []
    checks.append(
        {
            "name": "python",
            "ok": sys.version_info >= (3, 12),
            "detail": sys.version.split()[0],
        }
    )
    for dependency in ("pydantic", "PyYAML", "jsonschema", "typer", "rich"):
        try:
            version = importlib.metadata.version(dependency)
            checks.append({"name": dependency, "ok": True, "detail": version})
        except importlib.metadata.PackageNotFoundError:
            checks.append({"name": dependency, "ok": False, "detail": "not installed"})
    for command, args in (
        ("node", ["--version"]),
        ("npm", ["--version"]),
        ("codex", ["--version"]),
    ):
        ok, detail = _command_version(command, args)
        checks.append({"name": command, "ok": ok, "detail": detail})
    for relative in ("schemas", "fixtures", "content", "codex.md"):
        exists = (root / relative).exists()
        checks.append(
            {"name": relative, "ok": exists, "detail": "present" if exists else "missing"}
        )
    return checks


def run_quick_doctor(root: Path, *, require_codex: bool = True) -> list[dict[str, str | bool]]:
    """Checks required by the unattended mentor loop."""
    checks: list[dict[str, str | bool]] = [
        {
            "name": "python",
            "ok": sys.version_info >= (3, 12),
            "detail": sys.version.split()[0],
        }
    ]
    for dependency in ("pydantic", "PyYAML", "jsonschema", "typer", "rich"):
        try:
            version = importlib.metadata.version(dependency)
            checks.append({"name": dependency, "ok": True, "detail": version})
        except importlib.metadata.PackageNotFoundError:
            checks.append({"name": dependency, "ok": False, "detail": "not installed"})
    if require_codex:
        ok, detail = _command_version("codex", ["--version"])
        checks.append({"name": "codex", "ok": ok, "detail": detail})
    for relative in (
        "codex.md",
        "schemas/course.schema.json",
        "schemas/review.schema.json",
        "content/profile",
        "content/progress/summary.json",
    ):
        exists = (root / relative).exists()
        checks.append(
            {"name": relative, "ok": exists, "detail": "present" if exists else "missing"}
        )
    return checks
