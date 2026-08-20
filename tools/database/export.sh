#!/bin/sh
set -eu

umask 077

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required" >&2
  exit 127
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=".mentor/backups/$timestamp"
backup_file="$backup_dir/ai-mentor.dump"

mkdir -p "$backup_dir"

pg_dump \
  --format=custom \
  --data-only \
  --no-owner \
  --no-privileges \
  --table=public.profiles \
  --table=public.progress_events \
  --table=public.pipeline_runs \
  --table=public.pending_reviews \
  --table=public.mastery_snapshots \
  --table=public.card_states \
  --table=public.weekly_reports \
  --table=public.assignments \
  --table=public.reviews \
  --file="$backup_file"

if command -v shasum >/dev/null 2>&1; then
  (cd "$backup_dir" && shasum -a 256 "$(basename "$backup_file")" >"$(basename "$backup_file").sha256")
else
  (cd "$backup_dir" && sha256sum "$(basename "$backup_file")" >"$(basename "$backup_file").sha256")
fi

echo "Backup created: $backup_file"
