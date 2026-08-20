# Sprint 0 connectivity journal

This journal records release-gate evidence without credentials or personal data. A check is complete only when its date, network class and result are recorded here.

## Automated project inspection

Date: 2026-08-18

- Supabase MCP connection: pass.
- Supabase project API metadata: reachable from the Codex execution environment.
- `public` schema: empty before application migrations.
- migration history: empty before application migrations.
- Supabase security advisors: no findings against the empty schema.
- GitHub repository: `ilnitskii/ai-mentor-web`.

This does not prove availability from the target Russian ISPs or from a physical iPhone.

## Target-network release gates

| Check | Network | Date | Result | Notes |
|---|---|---|---|---|
| Open GitHub Pages cold/warm | Home Wi-Fi | — | pending | Record timings without public IP or SSID. |
| Open GitHub Pages cold/warm | Mobile data | — | pending | Test on the physical iPhone without VPN. |
| Login and read own RLS row | Home Wi-Fi | — | pending | Use a synthetic/bootstrap account. |
| Login and read own RLS row | Mobile data | — | pending | Confirm another user's row is absent. |
| Export and restore test data | Owner machine | — | pending | Restore into a separate test project/table. |

## Decisions still open

- Supabase region after target-network latency measurements.
- IndexedDB wrapper selected in Sprint 4: `idb`, with one versioned database for public content cache, per-user active sessions and append-only event outbox.
- Whether every weekly candidate requires manual approval after the first three runs.

## Safety rules

- Do not record project secrets, tokens, direct database URLs, user emails or real answers here.
- Supabase MCP reachability is useful implementation evidence, but it is not a substitute for the physical iPhone and ISP checks.
- Database changes are authored in `database/migrations/` before they are applied to a remote project.
