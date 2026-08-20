-- Synthetic local-only users. Never replace these rows with real accounts or answers.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'alice@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'bob@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.profiles (
  user_id,
  goal,
  level,
  learning_role,
  language,
  timezone,
  daily_minutes
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Synthetic analytics interview practice',
    'beginner',
    'data_analyst',
    'ru',
    'Europe/Moscow',
    25
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Synthetic SQL revision',
    'junior',
    'data_analyst',
    'ru',
    'UTC',
    20
  )
on conflict (user_id) do nothing;

insert into public.progress_events (
  event_id,
  user_id,
  device_id,
  item_id,
  event_type,
  occurred_at,
  timezone,
  payload
)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'synthetic-alice-device',
    'foundations.data-tables.intro',
    'lesson_completed',
    '2026-08-18T08:00:00Z',
    'Europe/Moscow',
    '{"duration_seconds":240}'::jsonb
  ),
  (
    '22000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'synthetic-bob-device',
    'sql.window-functions.task-choice',
    'task_submitted',
    '2026-08-18T09:00:00Z',
    'UTC',
    '{"attempt":1,"correct":true}'::jsonb
  )
on conflict (event_id) do nothing;
