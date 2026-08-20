# Weekly candidate and publish workflow

Sprint 7 separates generation, deterministic validation, manual approval and
publication. Candidate generation may write only below
`staging/candidate/<run_id>/`; rejected output is moved to ignored
`.mentor/quarantine/` and never published.

## Safety sequence

1. Acquire the exclusive weekly-run lock. If the Mac was off, the next manual
   run reads all events after each user's unchanged cursor.
2. Fetch bounded, isolated user batches and create a local pre-publish backup.
3. Generate one candidate per user. The production generator uses the bounded
   manifest and ephemeral Codex runner; tests use `SyntheticCandidateGenerator`
   with no network or model call.
4. Validate `weekly_report`, `assignment`, every review, the compiled course,
   stable IDs, prerequisites, time budget, adaptation policy and protected
   workspace diff.
5. Review `candidate.diff`, `policy-report.json` and `run_summary.md`, then record
   the immutable candidate digest:

   ```bash
   ./mentor candidate-digest staging/candidate/<run_id>
   ```

6. Publish only if the current digest still equals the approved digest.
   Candidate changes after approval fail with `CANDIDATE_TAMPERED`.
7. Call the single PostgreSQL RPC `publish_weekly_bundle`. It inserts the report,
   assignment, reviews, pending-review status changes and `pipeline_runs` cursor
   audit in one transaction.
8. Save the local per-user cursor only after the RPC succeeds. A database error,
   invalid review or quarantine leaves it unchanged.

The idempotency UUID is derived from user, report period and input cursor. A
repeat of the same run returns `published=false`; the unique report-period and
assignment-report constraints prevent a second assignment even when new events
arrive in the same period.

## Quarantine and fallback

```bash
./mentor quarantine-candidate staging/candidate/<run_id>
```

The local fake-adapter test suite covers two independent users, duplicate
publish, post-approval tampering, invalid review, database failure, concurrent
lock and cursor commit-last. The first three hosted runs remain manual release
gates in Sprint 8; no launchd job should receive a secret in its plist or command
arguments.
