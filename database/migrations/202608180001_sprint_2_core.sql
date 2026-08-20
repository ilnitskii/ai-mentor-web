begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal text not null default '',
  level text not null default 'beginner'
    check (level in ('beginner', 'junior', 'middle', 'senior')),
  learning_role text not null default 'data_analyst'
    check (char_length(learning_role) between 1 and 80),
  language text not null default 'ru'
    check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 80),
  daily_minutes smallint not null default 25
    check (daily_minutes between 5 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.progress_events (
  event_id uuid primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  schema_version smallint not null default 1 check (schema_version = 1),
  profile_id text not null default 'default'
    check (char_length(profile_id) between 1 and 80),
  device_id text not null check (char_length(device_id) between 1 and 160),
  item_id text not null check (char_length(item_id) between 1 and 240),
  event_type text not null check (char_length(event_type) between 1 and 80),
  occurred_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 80),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now()
);

create index if not exists progress_events_user_occurred_idx
  on public.progress_events (user_id, occurred_at desc);

create table if not exists public.pipeline_runs (
  run_id uuid primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  status text not null
    check (status in ('started', 'candidate_ready', 'published', 'failed', 'quarantined')),
  input_cursor jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input_cursor) = 'object'),
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check (finished_at is null or finished_at >= started_at)
);

create index if not exists pipeline_runs_user_started_idx
  on public.pipeline_runs (user_id, started_at desc);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_progress_event_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
begin
  if authenticated_user_id is not null then
    new.user_id := authenticated_user_id;
  end if;

  if new.user_id is null then
    raise exception using
      errcode = '23502',
      message = 'progress event owner is required';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

drop trigger if exists progress_events_set_owner on public.progress_events;
create trigger progress_events_set_owner
before insert on public.progress_events
for each row execute function public.set_progress_event_owner();

alter table public.profiles enable row level security;
alter table public.progress_events enable row level security;
alter table public.pipeline_runs enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists progress_events_select_own on public.progress_events;
create policy progress_events_select_own
on public.progress_events
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists progress_events_insert_own on public.progress_events;
create policy progress_events_insert_own
on public.progress_events
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.progress_events from anon, authenticated;
revoke all on table public.pipeline_runs from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (goal, level, learning_role, language, timezone, daily_minutes)
  on table public.profiles to authenticated;
grant select, insert on table public.progress_events to authenticated;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.progress_events to service_role;
grant select, insert, update, delete on table public.pipeline_runs to service_role;

revoke all on function public.set_profile_updated_at() from public;
revoke all on function public.set_progress_event_owner() from public;
grant execute on function public.set_profile_updated_at() to authenticated, service_role;
grant execute on function public.set_progress_event_owner() to authenticated, service_role;

commit;
