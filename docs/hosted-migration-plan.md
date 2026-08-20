# План первого применения миграций в hosted Supabase

Статус: подготовлено, удалённая БД не изменялась.

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

## Rollback

До появления реальных данных можно удалить созданные объекты в обратном
порядке. После первой регистрации или события сначала обязателен export;
автоматический destructive rollback намеренно отсутствует.
