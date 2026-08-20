\set ON_ERROR_STOP on

-- Required psql variables: user_id, goal, level, learning_role, language,
-- timezone and daily_minutes. Create the Auth user in Supabase Dashboard first.
insert into public.profiles (
  user_id,
  goal,
  level,
  learning_role,
  language,
  timezone,
  daily_minutes
)
values (
  :'user_id'::uuid,
  :'goal',
  :'level',
  :'learning_role',
  :'language',
  :'timezone',
  :'daily_minutes'::smallint
)
on conflict (user_id) do update
set goal = excluded.goal,
    level = excluded.level,
    learning_role = excluded.learning_role,
    language = excluded.language,
    timezone = excluded.timezone,
    daily_minutes = excluded.daily_minutes;
