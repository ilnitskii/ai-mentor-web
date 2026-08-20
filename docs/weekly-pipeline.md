# Weekly pipeline runbook

The weekly Python pipeline runs outside the browser and uses the Supabase Data
API with a server-side secret. It never passes the secret, project URL or a raw
database dump to Codex. Local runtime files, cursors, private answer batches and
backups are stored only below ignored `.mentor/`.

## Synthetic dry-run

This mode uses two isolated synthetic users, does not need network credentials,
does not invoke Codex and performs zero remote writes:

```bash
./mentor weekly-dry-run \
  --run-id local-synthetic-check \
  --fake-source fixtures/pipeline-source.synthetic.json
```

Console output contains only hashed user references, counts and event IDs. Raw
free answers are written only to the mode-0600 local run area required for the
later review step and are absent from the dry-run report.

## Read-only hosted dry-run

Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in a local ignored `.env` or OS
credential mechanism, export them only for the command process, then run
`weekly-dry-run` without `--fake-source`. Do not use the browser publishable key
for this pipeline and never put either value in arguments, logs, fixtures or
committed files.

The adapter fetches at most 10 profiles, 500 events and 100 pending answers per
user. Every user receives a separate batch and hashed local directory. The
cursor is a `(received_at, event_id)` pair per user. A dry-run never advances it;
publish code may advance it only after backup, validation and all database writes
succeed.

## Backup and restore

Before a publish attempt the pipeline exports the allowlisted mutable output
tables `weekly_reports`, `assignments` and `reviews` to a checksummed mode-0600
JSON backup. Restore validates the schema, exact table allowlist and checksum.
Restore must target a separate test project or an explicitly approved recovery
operation; it is not part of dry-run.

The SQL tables are defined in
`database/migrations/202608180004_sprint_6_weekly_pipeline.sql`. Authenticated
browser users can only select their own rows through RLS. Only the server-side
pipeline role can publish or update weekly output.
