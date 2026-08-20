# Настройка окружения

## 1. Где взять значения

В Supabase Dashboard откройте **Project Settings → API**:

- `Project URL` — это значение для `VITE_SUPABASE_URL` и `SUPABASE_URL`;
- `Publishable key` (`sb_publishable_…`) — для `VITE_SUPABASE_PUBLISHABLE_KEY`;
- `Secret key` (`sb_secret_…`) — только для локального недельного pipeline.

Не используйте secret/service-role key в переменной с префиксом `VITE_`: Vite
включит такое значение в публичный JavaScript bundle.

## 2. Локальный web

Создайте ignored-файл `apps/web/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Перезапустите `npm run dev` после изменения файла. Если обе переменные не
заданы, приложение намеренно запускается с локальным fake adapter.

## 3. Локальный недельный pipeline

Создайте ignored-файл `.env` в корне проекта:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_YOUR_KEY
```

CLI не читает `.env` автоматически. Перед ручным hosted-run загрузите значения
в текущий shell, не печатая их:

```bash
set -a
source .env
set +a
./mentor doctor
```

Не коммитьте `.env` и не присылайте его содержимое в чат или логи.

## 4. GitHub Pages

В GitHub откройте **Settings → Secrets and variables → Actions → Variables** и
создайте две repository variables:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`.

Они являются публичной конфигурацией frontend. `SUPABASE_SECRET_KEY` в GitHub
для Pages не нужен и добавляться туда не должен.

В **Settings → Pages → Build and deployment** выберите **GitHub Actions**.
Workflow соберёт сайт с base path имени репозитория после merge/push в `main`.

## 5. Auth для регистрации по имени

Перед первой регистрацией откройте **Authentication → Providers → Email**:

1. включите email/password provider и разрешите signup;
2. отключите **Confirm email** — технические email не принадлежат пользователям;
3. оставьте минимальную длину пароля не меньше 8 символов;
4. после регистрации всех 1–3 пользователей можно отключить signup: вход уже
   созданных пользователей продолжит работать.

Пользователь вводит только имя и пароль. Клиент нормализует имя и локально
получает из него детерминированный технический email; в интерфейсе email не
показывается. Supabase Auth выдаёт отдельный UUID, а RLS изолирует историю по
этому UUID.
