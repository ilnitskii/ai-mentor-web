#!/bin/sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

if [ "${AI_MENTOR_APPLY_CONFIRM:-}" != "hosted-project-after-backup" ]; then
  echo "Refusing migration: set AI_MENTOR_APPLY_CONFIRM=hosted-project-after-backup" >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 127
fi

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
for migration in "$project_root/database/migrations/"*.sql; do
  psql --set=ON_ERROR_STOP=on --file="$migration"
  echo "Applied $(basename "$migration")"
done
