import json

import typer

from mentor_pipeline.cli import app
from mentor_pipeline.errors import PipelineError
from mentor_pipeline.schema import SchemaValidationError

try:
    app()
except PipelineError as error:
    typer.echo(
        json.dumps(
            {
                "status": "failed",
                "error_code": error.code,
                "message": error.message,
                "details": error.details,
            },
            ensure_ascii=False,
        ),
        err=True,
    )
    raise SystemExit(2) from error
except SchemaValidationError as error:
    typer.echo(
        json.dumps(
            {
                "status": "failed",
                "error_code": "SCHEMA_INVALID",
                "message": str(error),
            },
            ensure_ascii=False,
        ),
        err=True,
    )
    raise SystemExit(2) from error
