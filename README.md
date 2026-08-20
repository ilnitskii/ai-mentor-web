# AI Mentor Web

Персональный web/PWA‑тренажёр по data analytics и подготовке к собеседованиям. Сайт рассчитан на 1–3 пользователей, открывается на iPhone в браузере, хранит прогресс в Supabase и публикуется как статическое приложение на GitHub Pages.

Раз в неделю локальный Python/Codex‑пайплайн получает новые учебные события, находит слабые темы и готовит отчёт, рекомендации, проверки свободных ответов и новые контрольные. Codex не имеет доступа к пользовательскому браузеру и не публикует результат без детерминированной проверки.

## Зафиксированный MVP

- frontend: React + TypeScript + Vite;
- доставка: GitHub Pages + GitHub Actions;
- режим на iPhone: responsive PWA, Safari и «Добавить на экран Домой»;
- backend: Supabase Free — Postgres, Auth и Data API;
- доступ: самостоятельная регистрация 1–3 пользователей по имени + паролю;
- безопасность: Row Level Security по `user_id`;
- локальный кэш: IndexedDB и очередь неподтверждённых событий;
- mentor pipeline: Python 3.12+, Pydantic, JSON Schema и Codex;
- периодичность анализа: один раз в неделю и ручной запуск.

GitHub Pages хранит только статический frontend. База, вход пользователей и динамические данные находятся в Supabase. Publishable key является публичной конфигурацией frontend; secret/service-role key хранится только локально и никогда не попадает в Pages или git.

## Документация

- [Техническое задание](technical_specification.md) — продуктовые сценарии и критерии MVP.
- [Архитектура](architecture.md) — компоненты, стек, данные, безопасность и deployment.
- [Спринты](sprints.md) — новый план разработки web/PWA.
- [Правила недельного mentor-run](codex.md) — разрешённые входы, выходы и ограничения Codex.
- [Выбор базы данных](docs/database-selection.md) — сравнение бесплатных вариантов с учётом использования из РФ.
- [ADR-002](docs/adr/ADR-002-web-pwa-github-pages-supabase.md) — переход с native iOS на GitHub Pages + Supabase.
- [ADR-003](docs/adr/ADR-003-self-service-named-signup.md) — безопасная регистрация по имени без пользовательского email.
- [Окружение и deployment](docs/environment.md) — шаблоны `.env`, Supabase Auth и GitHub Pages variables.
- [Hosted migration plan](docs/hosted-migration-plan.md) — read-only inspection, порядок применения и post-checks.
- [Программа Data Analyst](docs/curriculum-data-analyst-zero.md) — учебный маршрут и выпускные критерии.
- [Progress projection v1](docs/progress-v1.md) — веса mastery, review schedule, XP, streak и rebuild policy.
- [Weekly pipeline runbook](docs/weekly-pipeline.md) — bounded Supabase batches, dry-run, cursor и backup policy.
- [Weekly publish workflow](docs/weekly-publish.md) — lock, validation, manual digest approval, quarantine и transactional publish.

ADR-001 сохранён только как историческое решение и отменён ADR-002.

## Текущий статус

Native iOS/macOS и iCloud transport удалены. Сохранены:

- учебный контент в `content/`;
- JSON Schema и fixtures;
- Python‑валидация, агрегация прогресса и подготовка bounded context;
- правила mastery, review и генерации контента как продуктовый контракт.

Sprint 7 реализован локально. В web‑клиенте доступны регистрация и вход по имени + паролю, logout и полный сценарий `урок → 5 карточек → задача → итог`. Каждое учебное событие атомарно сохраняется вместе с активной сессией в IndexedDB до обновления UI, затем idempotent sync доставляет outbox в Supabase. Свободный ответ хранится в отдельной локальной очереди `pending_review` и не попадает в event payload. Экран показывает online/offline, pending count, последнюю успешную sync и ручной retry; `EVENT_CONFLICT` не перезаписывает удалённое событие. Production service worker кэширует только versioned shell assets, не сохраняет Auth/Data API responses и при обновлении не затрагивает IndexedDB outbox.

Versioned reducer `progress-v1` строит mastery/evidence history, расписание карточек, XP, streak, shields, due queue и журнал ошибок из append-only events. Он учитывает hints, просмотр решения, свежесть, повтор одного item, DST и clock skew; duplicate event не начисляет XP второй раз. `mastery_snapshots` и `card_states` сохраняются в Supabase как защищённые RLS проекции и полностью перестраиваются из событий. Общий synthetic fixture проверяется одинаково в TypeScript и Python pipeline.

Недельный Python adapter валидирует окружение без печати secrets, читает bounded per-user batches по cursor, переносит `pending_reviews`, агрегирует их локально и создаёт checksum backup до публикации. `weekly-dry-run` не вызывает Codex, не пишет в БД и не сдвигает cursor; synthetic прогон показывает только counts, hashed user refs и IDs. Таблицы `weekly_reports`, `assignments` и `reviews` доступны браузеру только на чтение собственных строк через RLS.

Weekly orchestration использует exclusive lock, отдельный candidate каждого пользователя, schema/policy/stable-ID checks, manual digest approval и quarantine. PostgreSQL RPC публикует report, assignment, reviews и audit cursor одной транзакцией; локальный cursor записывается последним. Идемпотентный повтор не создаёт второй assignment, а tampering, invalid review или DB error не меняют cursor. Реальные первые hosted/Codex runs намеренно оставлены ручным release gate.

Markdown рендерится без raw HTML, закрытые ответы проверяются детерминированно, а свободные получают `pending_review`. Контент собирается из `content/` в типизированный web snapshot и сохраняется в публичный IndexedDB cache. Миграции пользовательских и projection-таблиц, RLS и pgTAP tests находятся в `database/`. Все шесть миграций применены к hosted Supabase и отмечены в migration history; самостоятельная регистрация по имени и паролю включена, synthetic seed не применялся.

## Структура

```text
ai_mentor_app/
├── apps/web/                    # React/Vite PWA
├── content/                     # авторский учебный контент
├── database/                    # SQL migrations, seed и RLS policies
├── schemas/                     # JSON Schema внешних контрактов
├── fixtures/                    # безопасные тестовые данные
├── tools/mentor_pipeline/       # локальный Python/Codex pipeline
├── docs/adr/                    # архитектурные решения
├── staging/                     # candidate output, не коммитится
└── .mentor/                     # локальное состояние и backups, не коммитится
```

Каталог `database/` содержит источник истины для удалённой схемы Supabase, owner bootstrap, synthetic seed и RLS tests.

## Web‑окружение

```bash
npm ci
npm run check
npm run db:test
npm run db:test:supabase # требует запущенный Docker Desktop
npm run dev
```

Offline/retry покрыты unit/integration tests и проверены Playwright CLI на production preview: offline action переживает reload, активная сессия возобновляется, pending event после события `online` доставляется один раз. Финальный release gate на физическом iPhone выполняется после публикации hosted Supabase и GitHub Pages.

Для локального подключения Supabase перенесите две публичные `VITE_` переменные из `.env.example` в `apps/web/.env.local`. Полная пошаговая инструкция находится в [docs/environment.md](docs/environment.md). Без этих переменных приложение использует fake adapter и не требует credentials.

## Python‑окружение

```bash
python3 -m venv venv
venv/bin/python -m pip install -r requirements-dev.lock
venv/bin/python -m pip check
```

Доступные проверки сохранённого pipeline:

```bash
./mentor doctor
./mentor validate-event fixtures/progress-event.valid.json
./mentor validate-content fixtures/course.valid.json
./mentor validate-curriculum
./mentor aggregate-progress
./mentor prepare-mentor-run --run-id manual-check
venv/bin/ruff check tools/mentor_pipeline
venv/bin/pytest
```

## Секреты

В git допустимы:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` — только вместе с корректными RLS policies.

В git и frontend запрещены:

- `SUPABASE_SECRET_KEY` и legacy `service_role`;
- строка прямого подключения к Postgres;
- Codex/OpenAI tokens;
- дампы с реальными ответами пользователей.

Локальные секреты хранятся в `.env.local` или системном хранилище credentials; все `.env*`, кроме шаблонов, игнорируются git.
