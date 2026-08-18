# Project instructions

For application-development tasks, treat `technical_specification.md` and `architecture.md` as the approved baseline. Do not change an architectural decision listed in `architecture.md` without documenting an ADR and explaining the impact.

The product baseline is Web/PWA on GitHub Pages with Supabase. Native iOS/macOS, SwiftData, Xcode and iCloud Drive transport are out of scope unless a new ADR explicitly restores them.

For a weekly mentor/content-generation run, read and follow `codex.md`; its staging-only write restrictions apply to that run. Those restrictions do not apply to implementation tasks in `apps/`, `database/`, `tools/`, `schemas/`, tests or project documentation.

Never place Supabase secret/service-role keys, direct Postgres credentials, Codex tokens or real user answers in git, frontend bundles, fixtures or logs. A Supabase publishable key may be used in the frontend only with tested Row Level Security policies.

