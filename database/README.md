# Database runbook — Sprints 2–7 + named signup

`database/migrations/` is the source of truth. Migrations are transactional and
safe to run again against the same schema. Supabase normally records migration
versions and rejects an already applied version before SQL is executed.

## Local verification

Install dependencies, then run the fast empty-database and RLS check from the
repository root:

```bash
npm ci
npm run db:test
```

The PGlite harness applies all migrations twice, loads the synthetic seed and
proves the Alice, Bob, anonymous and `service_role` cases against PostgreSQL RLS.
It never uses network credentials.

For the Supabase integration check, start Docker Desktop and run:

```bash
npm run db:test:supabase
```

The integration wrapper stages the approved files in a temporary CLI workdir,
applies them to an empty local Supabase database, runs pgTAP, stops the stack and
removes the workdir. It does not duplicate the migration source. Never point the
synthetic seed at production.

## Hosted project and named-user bootstrap

1. Export the current hosted data before applying a migration.
2. Review the local SQL and compare the hosted schema with `supabase db diff`.
3. Supply PostgreSQL's standard `PG*` environment variables and apply the
   reviewed source without putting the connection string in process arguments:

   ```bash
   AI_MENTOR_APPLY_CONFIRM=hosted-project-after-backup \
     tools/database/apply.sh
   ```

4. In **Authentication → Providers → Email**, temporarily allow signup, disable
   **Confirm email**, keep email/password sign-in enabled and require at least
   eight password characters.
5. Each learner registers in the site with a unique name and password. The Auth
   trigger creates the matching profile automatically; no UUID copy or SQL
   bootstrap is required.
6. After all expected users have registered, disable signup. Existing sign-in
   continues to work.
7. Run `npm run db:test` and `npm run db:test:supabase`, then re-check Supabase
   security and performance advisors.

The manual profile bootstrap remains available only for legacy/admin-created
Auth users:

```bash
psql -v user_id=00000000-0000-4000-8000-000000000000 \
  -v goal='Interview preparation' \
  -v level=beginner \
  -v learning_role=data_analyst \
  -v language=ru \
  -v timezone=Europe/Moscow \
  -v daily_minutes=25 \
  -f database/bootstrap/profile.sql
```

## Backup, restore and rollback

`tools/database/export.sh` writes a mode-0600 custom dump and checksum below
ignored `.mentor/backups/`. Connection values are read only from PostgreSQL's
standard `PG*` environment variables and are never printed.

Restore only into a separate empty test project after applying the same
migrations. The restore script requires an explicit safety confirmation:

```bash
tools/database/export.sh
AI_MENTOR_RESTORE_CONFIRM=separate-test-project \
  tools/database/restore.sh .mentor/backups/<timestamp>/ai-mentor.dump
```

The migrations only create new objects. If they must be rolled back, first
export the data, then drop `reviews`, `assignments`, `weekly_reports`,
`card_states`, `mastery_snapshots`, `pending_reviews`, `pipeline_runs`,
`progress_events`, `profiles` in that dependency order and remove the
`on_auth_user_created` and `profiles_set_identity_defaults` triggers plus
owner/update trigger functions. The two
projection tables are rebuildable from events; the append-only events are not.
Dropping these tables destroys data, so rollback is intentionally not automated.
