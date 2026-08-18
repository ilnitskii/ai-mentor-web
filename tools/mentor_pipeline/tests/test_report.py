import json
import shutil
from datetime import UTC, datetime

from mentor_pipeline.paths import repository_root
from mentor_pipeline.report import make_report, write_run_report

ROOT = repository_root()


def test_failed_pipeline_stage_writes_stable_machine_readable_report() -> None:
    workspace = ROOT / ".mentor/report-test"
    shutil.rmtree(workspace, ignore_errors=True)
    workspace.mkdir(parents=True)
    report = workspace / "run-report.json"

    write_run_report(
        report,
        make_report(
            "publish-weekly-report",
            "failed",
            datetime.now(UTC),
            error_code="PIPELINE_FAILED",
            message="Synthetic failure",
        ),
    )

    payload = json.loads(report.read_text())
    assert payload["schema_version"] == 1
    assert payload["status"] == "failed"
    assert payload["error_code"] == "PIPELINE_FAILED"
    assert payload["message"]
