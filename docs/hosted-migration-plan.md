# План и результат первого применения миграций в hosted Supabase

Статус на 2026-08-20: все шесть миграций применены к пустому hosted project в
указанном ниже порядке. Synthetic seed не применялся.

## Release gate

1. Восстановить OAuth-доступ read-only Supabase MCP.
2. Проверить project ref и получить список таблиц/миграций схем `public` и
   `auth`, не выгружая пользователей, ответы или credentials.
3. Подтвердить, что `public` не содержит прикладных таблиц либо зафиксировать
   расхождение с локальным source of truth.
4. Повторно просмотреть SQL в `database/migrations/` и результат локальных
   `npm run db:test` / `npm run db:test:supabase`.
5. Получить отдельное подтверждение владельца на применение. Read-only MCP не
   может и не должен менять hosted project.

## Порядок миграций

1. `202608180001_sprint_2_core.sql`
2. `202608180002_sprint_3_pending_reviews.sql`
3. `202608180003_sprint_5_progress_projections.sql`
4. `202608180004_sprint_6_weekly_pipeline.sql`
5. `202608180005_sprint_7_transactional_publish.sql`
6. `202608200001_sprint_7_named_signup.sql`

Миграции выполняются только в указанном порядке и одной версионированной
цепочкой. Synthetic seed к hosted project не применяется.

## Проверка после применения

- все девять пользовательских таблиц имеют RLS;
- `anon` не имеет доступа к пользовательским таблицам;
- `authenticated` читает только собственные строки и не может менять
  append-only events;
- `publish_weekly_bundle` недоступна browser roles;
- insert в `auth.users` создаёт ровно один `profiles` row;
- security/performance advisors не показывают новых критичных проблем;
- регистрация тестового пользователя выполняется только после настройки Auth
  из `docs/environment.md`.

Фактический post-check от 2026-08-20:

- созданы девять ожидаемых таблиц и RPC `publish_weekly_bundle`;
- RLS включён на всех девяти таблицах, установлены 11 ожидаемых policies;
- `anon` не читает `profiles`, а browser roles не выполняют
  `publish_weekly_bundle` и signup trigger functions;
- `service_role` сохраняет доступ к transactional publish, а
  `supabase_auth_admin` — к auth trigger;
- Security Advisor: 0 errors, 0 warnings; единственная info-рекомендация про
  отсутствие policy у `pipeline_runs` ожидаема, потому что таблица доступна
  только `service_role`;
- Performance Advisor: 0 errors, 0 warnings; info содержит ожидаемые для пустой
  базы unused indexes и две рекомендации по индексам внешних ключей;
- Confirm email выключен, email/password signup включён, anonymous signup
  выключен.

Применение выполнялось через SQL Editor, поэтому первоначально журнал
`supabase_migrations.schema_migrations` отсутствовал. 2026-08-20 выполнен
официальный `supabase migration repair`: CLI и Supabase MCP показывают все шесть
версий выше со статусом `applied`. SQL миграций повторно не выполнялся,
synthetic seed не запускался. Следующий `supabase db push` должен добавлять
только новые версии миграций.

## Rollback

До появления реальных данных можно удалить созданные объекты в обратном
порядке. После первой регистрации или события сначала обязателен export;
автоматический destructive rollback намеренно отсутствует.
