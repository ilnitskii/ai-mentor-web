# ADR-002: Web/PWA на GitHub Pages с Supabase

Статус: Accepted  
Дата: 2026-08-18  
Отменяет: ADR-001 как активный baseline

## Контекст

Native iOS‑решение требует Xcode signing, периодического переподписания бесплатной сборки либо платной программы распространения. Для личного учебного продукта это добавляет SwiftUI/SwiftData, Mac helper, iCloud transport и отдельный cross-language sync, не создавая пропорциональной ценности.

Продукт нужен одному владельцу и максимум двум дополнительным пользователям. Главный клиент — iPhone, но достаточно браузера. Код и учебный контент могут быть публичными; приватными остаются credentials и пользовательские данные.

GitHub Pages подходит для статического PWA, но не выполняет backend code. Нужны внешние Auth, хранилище прогресса и API, доступные статическому frontend.

## Решение

1. Удалить native iOS/macOS, SwiftData, Xcode и iCloud Drive transport.
2. Создать React/TypeScript/Vite PWA в `apps/web`.
3. Публиковать production build через GitHub Actions в GitHub Pages.
4. Использовать Supabase Free как Postgres + Auth + Data API.
5. Разрешить browser access только через publishable key, user JWT и RLS.
6. Создавать 1–3 пользователей вручную и выключить public signup.
7. Хранить offline outbox/cache в IndexedDB.
8. Запускать недельный Codex pipeline локально на Mac; secret key хранить вне git.
9. Сохранять SQL migrations и provider adapters, чтобы не блокировать будущий переход.
10. До разработки провести connectivity tests из РФ; при провале выполнить Neon fallback spike и новый ADR/поправку.

## Последствия

### Положительные

- нет App Store, TestFlight, signing и платного Apple membership;
- один frontend работает на iPhone и desktop;
- исчезают Mac helper, bookmarks, iCloud race conditions и ZIP transport;
- Postgres становится единым источником истины;
- Supabase Auth/RLS позволяют не писать собственный backend для MVP;
- deployment frontend бесплатен и воспроизводим.

### Отрицательные

- ежедневная работа зависит от доступности GitHub Pages и Supabase;
- зарубежные сервисы могут быть нестабильны из РФ;
- Free plan не даёт production SLA и полноценного backup;
- offline режим браузера слабее native local-first приложения;
- RLS становится критической security boundary и требует обязательных tests;
- локальный scheduled task требует включённый Mac.

## Отклонённые варианты

### Продолжить native iOS

Отклонено владельцем продукта: эксплуатационные расходы и сложность не оправданы для 1–3 пользователей.

### Только GitHub Pages + IndexedDB

Отклонено: weekly pipeline не сможет автоматически получить прогресс, а очистка browser storage потеряет единственную копию данных.

### GitHub repository как база

Отклонено: browser потребовал бы privileged GitHub token, а ответы/прогресс смешались бы с публичным исходным кодом.

### Cloudflare Pages/Workers/D1

Технически подходит, но не выбран из‑за официально зафиксированного throttling Cloudflare traffic российскими ISP и дополнительной реализации auth/API.

### Neon как первый выбор

Хороший PostgreSQL fallback, но для новичка требует больше решений вокруг Auth/Data API/serverless boundary. Проверяется только если Supabase connectivity неудовлетворителен.

## Проверка решения

ADR считается подтверждённым после Sprint 0, когда:

- GitHub Pages открывается на физическом iPhone по Wi‑Fi и мобильной сети;
- Supabase login/select/insert работают на тех же сетях;
- RLS изолирует Alice и Bob;
- secret key отсутствует в frontend build;
- test export восстановлен в отдельное окружение.

