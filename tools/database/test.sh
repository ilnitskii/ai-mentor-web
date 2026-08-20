#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
supabase_cli="$project_root/node_modules/.bin/supabase"

if [ ! -x "$supabase_cli" ]; then
  echo "Supabase CLI is missing; run npm ci" >&2
  exit 127
fi

test_root=$(mktemp -d "${TMPDIR:-/tmp}/ai-mentor-supabase.XXXXXX")

cleanup() {
  "$supabase_cli" stop --workdir "$test_root" --no-backup >/dev/null 2>&1 || true
  rm -rf "$test_root"
}
trap cleanup EXIT INT TERM

mkdir -p "$test_root/supabase/migrations" "$test_root/supabase/tests/database"
cp "$project_root/database/supabase/config.toml" "$test_root/supabase/config.toml"
cp "$project_root/database/migrations/"*.sql "$test_root/supabase/migrations/"
cp "$project_root/database/seed/synthetic.sql" "$test_root/supabase/seed.sql"
cp "$project_root/database/tests/"*.sql "$test_root/supabase/tests/database/"

"$supabase_cli" start --workdir "$test_root" >/dev/null
"$supabase_cli" db reset --local --workdir "$test_root"
"$supabase_cli" test db --workdir "$test_root"
