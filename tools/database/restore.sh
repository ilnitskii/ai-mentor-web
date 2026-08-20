#!/bin/sh
set -eu

umask 077

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

if [ "${AI_MENTOR_RESTORE_CONFIRM:-}" != "separate-test-project" ]; then
  echo "Refusing restore: set AI_MENTOR_RESTORE_CONFIRM=separate-test-project" >&2
  exit 2
fi

backup_file=${1:?usage: restore.sh .mentor/backups/<timestamp>/ai-mentor.dump}
checksum_file="$backup_file.sha256"

if [ ! -f "$backup_file" ] || [ ! -f "$checksum_file" ]; then
  echo "Backup or checksum file is missing" >&2
  exit 2
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required" >&2
  exit 127
fi

if command -v shasum >/dev/null 2>&1; then
  (cd "$(dirname "$backup_file")" && shasum -a 256 -c "$(basename "$checksum_file")")
else
  (cd "$(dirname "$backup_file")" && sha256sum -c "$(basename "$checksum_file")")
fi

pg_restore \
  --data-only \
  --no-owner \
  --no-privileges \
  --single-transaction \
  --exit-on-error \
  "$backup_file"

echo "Restore completed into the explicitly confirmed test project"
