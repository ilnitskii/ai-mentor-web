# План реализации AI Mentor Web

Baseline: один разработчик, короткие вертикальные спринты. Sprint заканчивается работающим проверяемым результатом, а не количеством созданных слоёв.

## Общий Definition of Done

- acceptance criteria воспроизводятся документированной командой;
- TypeScript/Python type/lint/tests проходят локально;
- для изменения DB есть migration и rollback/backup note;
- RLS включён и проверен для любой новой пользовательской таблицы;
- credentials и реальные ответы отсутствуют в git, build artifacts и logs;
- mobile UI проверен на физическом iPhone;
- schema/public contract обновлены вместе с fixtures;
- Pages build работает под repository base path;
- критические ошибки имеют стабильный код и действие пользователя.

## Sprint 0 — Connectivity, Supabase и repository reset

**Цель:** проверить внешние зависимости из РФ и закрепить новый web baseline.

### Scope

- создать Supabase Free project в подходящем европейском регионе;
- открыть Dashboard, Auth и Data API с домашнего и мобильного подключения;
- создать минимальную test table с RLS и двух пользователей;
- доказать, что Alice не видит строку Bob;
- создать минимальную Vite page и временно опубликовать её на GitHub Pages;
- открыть Pages на физическом iPhone через Wi‑Fi и мобильный интернет;
- измерить cold/warm access и зафиксировать ISP/дату без персональных данных;
- проверить создание/возобновление free project и локальный SQL export;
- закрыть открытые решения ТЗ и обновить ADR при смене provider;
- очистить native iOS/iCloud слои репозитория.

### Acceptance criteria

- Pages и Supabase API доступны на целевых сетях без VPN как основной сценарий;
- frontend с publishable key читает только разрешённую RLS строку;
- secret key отсутствует в browser Network/Sources и git;
- backup test data восстановлен в отдельную таблицу/project;
- при провале доступности выполнен fallback spike с Neon, а baseline обновлён ADR.

## Sprint 1 — Web/PWA shell и CI

**Цель:** получить устанавливаемый mobile-first shell.

### Scope

- `apps/web` на React + TypeScript + Vite;
- router с GitHub Pages base/hash strategy;
- layout Today / Learn / Progress / Settings;
- CSS variables, typography и accessible primitives;
- Web App Manifest, icons и service worker;
- Supabase client interface и fake adapter;
- Vitest/Testing Library, ESLint, typecheck;
- GitHub Actions build/test/deploy Pages.

### Acceptance criteria

- clean checkout собирается одной командой;
- прямое открытие каждого route не даёт Pages 404;
- PWA добавляется на Home Screen iPhone;
- shell работает на 320 px, light/dark и reduced motion;
- PR build не требует secret key.

## Sprint 2 — Database schema, Auth и RLS

**Цель:** безопасно хранить данные 1–3 пользователей без собственного server process.

### Scope

- SQL migrations для profiles, progress_events и pipeline_runs;
- ручной owner bootstrap пользователей;
- email/password login/logout;
- выключение public signup;
- RLS policies и least-privilege grants;
- typed DB adapter;
- synthetic seed;
- automated Alice/Bob/anonymous/admin RLS cases;
- export/restore script без вывода secrets.

### Acceptance criteria

- anonymous не читает таблицы;
- Alice не читает и не изменяет Bob;
- browser не может update/delete progress_events;
- logout очищает пользовательский cache;
- migration применяется к пустой БД и повторно безопасно завершается либо явно отклоняется.

## Sprint 3 — Daily learning vertical slice

**Цель:** пройти полезную сессию на iPhone.

### Scope

- import/build текущего Markdown/YAML content;
- Today plan и lesson renderer;
- карточки основных типов;
- задачи choice/number/text/code-as-text;
- hints, attempts и summary;
- exact/normalized checker;
- progress event creation;
- базовые domain reducers в TypeScript.

### Acceptance criteria

- login → lesson → cards → task → summary работает на iPhone;
- каждый action создаёт валидный event;
- свободный ответ не получает ложную автоматическую оценку;
- raw HTML/script в lesson не исполняется;
- повторный render/navigation не создаёт дублирующий event.

## Sprint 4 — IndexedDB, offline outbox и sync

**Цель:** не терять учебную сессию при нестабильной сети.

### Scope

- IndexedDB repositories для cache/session/outbox;
- atomic local write before UI update;
- sync on launch/online/manual retry;
- insert idempotency по event_id;
- conflict detection;
- pending counter и last sync UI;
- resume active session;
- service worker caching policy;
- offline/retry Playwright scenarios.

### Acceptance criteria

- airplane/offline session сохраняется после reload;
- после сети события доходят один раз;
- одинаковый ID с другим payload даёт `EVENT_CONFLICT`;
- auth/API response не остаётся в Cache Storage;
- обновление PWA не удаляет unsent outbox.

## Sprint 5 — Mastery, review schedule и мотивация

**Цель:** перенести доказательную модель прогресса из старого прототипа в TypeScript/Postgres.

### Scope

- Mastery reducer v1 и evidence history;
- card scheduling reducer;
- XP/reward reducer и deduplication;
- streak, shield и timezone policy;
- mastery snapshots как rebuildable projection;
- Progress screen, error journal и due queue;
- DST, clock skew и duplicate tests.

### Acceptance criteria

- reducers дают одинаковый результат в browser и pipeline fixtures;
- чтение не поднимает mastery выше 40;
- hint снижает вес, но не обнуляет evidence;
- один event не начисляет XP дважды;
- projection можно перестроить из events.

## Sprint 6 — Supabase adapter для недельного pipeline

**Цель:** безопасно получить bounded данные из БД и подготовить публикацию.

### Scope

- Python read/write adapter;
- env validation без печати secrets;
- fetch events per user since cursor;
- pending_reviews transport;
- aggregate и local backup;
- SQL migrations для weekly_reports, assignments и reviews;
- fake adapter tests;
- dry-run без Codex и без записи.

### Acceptance criteria

- pipeline не передаёт secret key или DB URL в prompt/log;
- пользовательские batches разделены;
- dry-run показывает counts/IDs без answer bodies;
- backup создаётся до bulk publish и восстанавливается;
- DB error не сдвигает cursor.

## Sprint 7 — Недельный Codex mentor-loop

**Цель:** получить отчёт, review и адаптивную контрольную.

### Scope

- weekly orchestration и lock;
- bounded context manifest;
- Codex candidate generation;
- schema/policy/diff validation;
- stable ID enforcement;
- transactional publish;
- idempotency key `user + period + input cursor`;
- manual approve и quarantine;
- scheduled task на Mac и manual CLI fallback.

### Acceptance criteria

- повтор одного периода не создаёт второй assignment;
- candidate tampering блокирует publish;
- invalid review не меняет cursor;
- два пользователя получают независимые рекомендации;
- Mac-off scenario не теряет events и корректно догоняется вручную.

## Sprint 8 — Hardening и четыре недели личного использования

**Цель:** подтвердить полезность и устойчивость реальным использованием.

### Scope

- mobile UX polish и accessibility audit;
- сетевые fault cases для целевых ISP;
- Supabase quota/dashboard review;
- CSP и dependency audit;
- restore drill;
- первые три weekly runs с manual review;
- настройка алгоритма по фактическим ошибкам;
- документация эксплуатации.

### Acceptance criteria

- четыре недели прогресса без потери подтверждённых events;
- минимум три валидных weekly reports;
- восстановление из backup доказано;
- Pages/Supabase доступны в реальном ежедневном сценарии;
- пользователь понимает, почему назначена каждая контрольная;
- расходы остаются нулевыми либо любое отклонение заранее видно и документировано.

## После MVP

- перенос scheduled pipeline в облако, только если нужен Mac-off режим;
- serverless function для privileged operations;
- импорт вакансии/резюме;
- безопасный SQL sandbox;
- собственный домен;
- смена DB provider при подтверждённой проблеме доступности.

