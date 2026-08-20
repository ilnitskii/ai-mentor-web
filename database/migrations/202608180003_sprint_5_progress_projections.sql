begin;

create table if not exists public.mastery_snapshots (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  topic_id text not null check (char_length(topic_id) between 1 and 240),
  score smallint not null check (score between 0 and 100),
  evidence_count integer not null check (evidence_count >= 0),
  recent_accuracy numeric(6, 5) check (recent_accuracy between 0 and 1),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  algorithm_version text not null check (algorithm_version = 'progress-v1'),
  as_of timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id, algorithm_version)
);

create table if not exists public.card_states (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  card_id text not null check (char_length(card_id) between 1 and 240),
  due_at timestamptz not null,
  stability numeric(10, 4) not null check (stability >= 0.5),
  difficulty numeric(6, 4) not null check (difficulty between 1 and 10),
  last_event_id uuid not null,
  algorithm_version text not null check (algorithm_version = 'progress-v1'),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id, algorithm_version)
);

create index if not exists card_states_user_due_idx
  on public.card_states (user_id, due_at);

create or replace function public.set_projection_owner_and_updated_at()
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
    raise exception using errcode = '23502', message = 'projection owner is required';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mastery_snapshots_set_owner on public.mastery_snapshots;
create trigger mastery_snapshots_set_owner
before insert or update on public.mastery_snapshots
for each row execute function public.set_projection_owner_and_updated_at();

drop trigger if exists card_states_set_owner on public.card_states;
create trigger card_states_set_owner
before insert or update on public.card_states
for each row execute function public.set_projection_owner_and_updated_at();

alter table public.mastery_snapshots enable row level security;
alter table public.card_states enable row level security;

drop policy if exists mastery_snapshots_own on public.mastery_snapshots;
create policy mastery_snapshots_own
on public.mastery_snapshots
for all
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists card_states_own on public.card_states;
create policy card_states_own
on public.card_states
for all
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

revoke all on table public.mastery_snapshots from anon, authenticated;
revoke all on table public.card_states from anon, authenticated;
grant select, insert, update, delete on table public.mastery_snapshots to authenticated;
grant select, insert, update, delete on table public.card_states to authenticated;
grant select, insert, update, delete on table public.mastery_snapshots to service_role;
grant select, insert, update, delete on table public.card_states to service_role;

revoke all on function public.set_projection_owner_and_updated_at() from public;
grant execute on function public.set_projection_owner_and_updated_at()
  to authenticated, service_role;

commit;
