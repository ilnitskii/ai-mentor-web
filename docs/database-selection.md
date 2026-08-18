# Выбор бесплатной базы для AI Mentor

Статус: recommendation 1.0  
Проверено: 2026-08-18  
Контекст: GitHub Pages, 1–3 пользователя, разработчик впервые подключает внешнюю БД, доступ из РФ.

## Короткая рекомендация

Для MVP выбрать **Supabase Free** и регион с приемлемой задержкой после реального connectivity‑spike. Причина — это не только PostgreSQL, но и готовые Auth, Data API, JavaScript SDK и Row Level Security. Статический frontend на GitHub Pages может безопасно работать напрямую с Data API без собственного сервера.

Fallback: **Neon Free + Data API/Auth или небольшой serverless API**, если Supabase недоступен или нестабилен на целевых российских сетях. Этот вариант требует больше настройки, поэтому не является первым выбором новичка.

Cloudflare D1 не выбран baseline: продукт технически подходит и имеет щедрый free tier, но Cloudflare официально сообщает о систематическом throttling своих сервисов российскими ISP, вплоть до непригодной скорости соединений. Это повышенный риск именно для ежедневного mobile‑сценария в РФ.

## Сравнение

| Вариант | Плюсы | Минусы для этого проекта | Решение |
|---|---|---|---|
| Supabase Free | Postgres, Auth, Data API, RLS, JS SDK, 500 MB DB, 1 GB storage | project может приостанавливаться после недели неактивности; доступ из РФ не гарантирован SLA | основной выбор |
| Neon Free | стандартный Postgres, scale-to-zero, 100 CU-hours/project/month, Data API/RLS доступны | auth/client setup сложнее и экосистема меняется быстрее | fallback |
| Cloudflare D1 | SQLite semantics, Workers API, 5 GB free storage, без платы за idle | официальный риск сильного throttling в РФ; нужен Worker/API и отдельная auth модель | не использовать baseline |
| Firebase | простой browser SDK и auth | NoSQL усложняет связи events/reports/assignments; vendor-specific rules | не нужен |
| Managed PostgreSQL российского облака | локальная доступность и оплата | обычно нет постоянного полноценного free tier; нужен собственный API/auth | только платный fallback |

## Почему Supabase проще с GitHub Pages

GitHub Pages публикует только статические HTML/CSS/JavaScript и не выполняет Python/backend code. Supabase закрывает недостающие функции:

- login пользователей;
- PostgreSQL;
- HTTP Data API;
- row-level authorization;
- storage при необходимости;
- dashboard и SQL editor.

Frontend получает:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Publishable key виден любому посетителю и не является секретом. Доступ ограничивают JWT пользователя, RLS policies и grants.

Локальный mentor pipeline получает только через environment:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
```

Secret/service-role key обходит RLS. Его нельзя добавлять в `VITE_*`, JavaScript bundle, GitHub Pages, repository, issue, log или Codex prompt.

Официальные источники:

- [Supabase pricing](https://supabase.com/pricing) — Free: 500 MB database, 1 GB storage, 5 GB egress; неактивные projects могут приостанавливаться.
- [Supabase: securing data](https://supabase.com/docs/guides/database/secure-data) — frontend access через publishable key требует RLS; secret/service-role key нельзя раскрывать.
- [Supabase Auth](https://supabase.com/docs/guides/auth) — Auth интегрирован с JWT и RLS.
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) — Pages является static hosting.

## Особенности использования из РФ

Нельзя считать доступность зарубежного BaaS постоянной только по документации. В baseline вводится обязательная проверка:

1. Создать test project без реальных данных.
2. Открыть Supabase Dashboard с рабочего подключения.
3. С iPhone через домашний Wi‑Fi выполнить login, select и insert.
4. Повторить через мобильный интернет.
5. Повторить в разное время минимум два дня.
6. Зафиксировать дату, ISP, latency/error category без IP, email и tokens.
7. Проверить GitHub Pages теми же сетями.

Если Dashboard недоступен, но Data API работает стабильно, ежедневное использование возможно, но эксплуатация неудобна. Если Data API нестабилен хотя бы на одной основной сети, переходить к Neon spike до написания UI.

Для Cloudflare риск подтверждён официально: [Potential disruption of services for Russian users](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/service-disruption/).

## Минимальная безопасная настройка Supabase

1. Создать отдельный project только для AI Mentor.
2. Не загружать реальные данные до RLS tests.
3. Создать таблицы migrations, а не вручную без истории.
4. Включить RLS на таблице до выдачи `anon/authenticated` grants.
5. Владелец создаёт 1–3 пользователей вручную.
6. Выключить public signup.
7. Для каждой таблицы протестировать anonymous, Alice, Bob и admin.
8. Для `progress_events` разрешить пользователю `select/insert`, но не `update/delete`.
9. Не доверять `user_id` из JSON; policy должна сравнивать его с `auth.uid()`.
10. Перед migration/bulk publish создавать локальный export.

## Free plan и эксплуатационные риски

- 500 MB достаточно для личного текстового приложения при разумном payload и индексах, но фактический размер нужно контролировать.
- Free project может уснуть после недели неактивности; UI должен корректно показывать временную недоступность, а владелец — уметь возобновить project.
- Бесплатный план не заменяет backup. Недельный локальный export обязателен.
- Не следует строить бизнес‑критичный SLA на free tier; для личного приложения допустим ручной recovery.
- Условия, квоты и доступность могут измениться; перед реализацией каждого инфраструктурного спринта перепроверять официальные страницы.

## Условие смены provider

Смена Supabase допускается без изменения domain model, если:

- сохраняется PostgreSQL‑совместимая схема либо документируется migration;
- Auth adapter выдаёт стабильный application user ID;
- RLS/authorization acceptance cases воспроизведены;
- browser не получает privileged credentials;
- Python pipeline имеет read/write adapter и idempotent cursor.

