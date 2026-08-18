from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from mentor_pipeline.errors import PipelineError
from mentor_pipeline.paths import ensure_within_workspace
from mentor_pipeline.report import atomic_write_bytes


def run_codex(
    root: Path,
    prompt_path: Path,
    run_directory: Path,
    *,
    executable: str = "codex",
    timeout_seconds: int = 30 * 60,
) -> None:
    """Run a non-interactive, ephemeral Codex turn with workspace-write isolation."""
    root = ensure_within_workspace(root)
    prompt_path = ensure_within_workspace(prompt_path, root)
    run_directory = ensure_within_workspace(run_directory, root)
    resolved = shutil.which(executable) if "/" not in executable else executable
    if not resolved:
        raise PipelineError("CODEX_RUN_FAILED", "Codex CLI is not installed")

    last_message = run_directory / "codex-last-message.txt"
    command = [
        resolved,
        "exec",
        "--sandbox",
        "workspace-write",
        "--cd",
        str(root),
        "--ephemeral",
        "--output-last-message",
        str(last_message),
        "-",
    ]
    try:
        result = subprocess.run(
            command,
            input=prompt_path.read_text(encoding="utf-8"),
            text=True,
            capture_output=True,
            check=False,
            timeout=timeout_seconds,
            cwd=root,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise PipelineError("CODEX_RUN_FAILED", f"Codex could not complete: {error}") from error

    # Keep only operational metadata. Prompt/answer bodies must not enter diagnostics.
    metadata = {
        "schema_version": 1,
        "exit_code": result.returncode,
        "stdout_bytes": len(result.stdout.encode()),
        "stderr_bytes": len(result.stderr.encode()),
    }
    atomic_write_bytes(
        run_directory / "codex-result.json",
        (json.dumps(metadata, indent=2, sort_keys=True) + "\n").encode(),
    )
    if result.returncode != 0:
        last_line = (result.stderr or result.stdout).strip().splitlines()
        message = last_line[-1][:500] if last_line else f"exit {result.returncode}"
        raise PipelineError("CODEX_RUN_FAILED", message, exit_code=result.returncode)
