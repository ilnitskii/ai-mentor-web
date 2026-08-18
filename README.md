# AI Mentor Web

Персональный web/PWA‑тренажёр по data analytics и подготовке к собеседованиям. Сайт рассчитан на 1–3 пользователей, открывается на iPhone в браузере, хранит прогресс в Supabase и публикуется как статическое приложение на GitHub Pages.

Раз в неделю локальный Python/Codex‑пайплайн получает новые учебные события, находит слабые темы и готовит отчёт, рекомендации, проверки свободных ответов и новые контрольные. Codex не имеет доступа к пользовательскому браузеру и не публикует результат без детерминированной проверки.

## Зафиксированный MVP

- frontend: React + TypeScript + Vite;
- доставка: GitHub Pages + GitHub Actions;
- режим на iPhone: responsive PWA, Safari и «Добавить на экран Домой»;
- backend: Supabase Free — Postgres, Auth и Data API;
- доступ: заранее созданные 1–3 пользователя, новые регистрации выключены;
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
- [Программа Data Analyst](docs/curriculum-data-analyst-zero.md) — учебный маршрут и выпускные критерии.

ADR-001 сохранён только как историческое решение и отменён ADR-002.

## Текущий статус

Native iOS/macOS и iCloud transport удалены. Сохранены:

- учебный контент в `content/`;
- JSON Schema и fixtures;
- Python‑валидация, агрегация прогресса и подготовка bounded context;
- правила mastery, review и генерации контента как продуктовый контракт.

Web‑приложение и Supabase schema реализуются по новому плану спринтов.

## Структура

```text
ai_mentor_app/
├── apps/web/                    # React/Vite PWA, создаётся в Sprint 1
├── content/                     # авторский учебный контент
├── database/                    # SQL migrations, seed и RLS policies
├── schemas/                     # JSON Schema внешних контрактов
├── fixtures/                    # безопасные тестовые данные
├── tools/mentor_pipeline/       # локальный Python/Codex pipeline
├── docs/adr/                    # архитектурные решения
├── staging/                     # candidate output, не коммитится
└── .mentor/                     # локальное состояние и backups, не коммитится
```

Каталоги `apps/web/` и `database/` появятся при реализации соответствующих спринтов.

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

