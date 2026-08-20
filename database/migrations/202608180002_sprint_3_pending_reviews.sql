begin;

create table if not exists public.pending_reviews (
  review_id uuid primary key,
  attempt_id uuid not null unique,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  task_id text not null check (char_length(task_id) between 1 and 240),
  answer text not null check (char_length(answer) between 1 and 30000),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'under_review', 'reviewed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists pending_reviews_user_status_idx
  on public.pending_reviews (user_id, status, submitted_at);

create or replace function public.set_pending_review_owner()
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
      message = 'pending review owner is required';
  end if;

  return new;
end;
$$;

drop trigger if exists pending_reviews_set_owner on public.pending_reviews;
create trigger pending_reviews_set_owner
before insert on public.pending_reviews
for each row execute function public.set_pending_review_owner();

alter table public.pending_reviews enable row level security;

drop policy if exists pending_reviews_select_own on public.pending_reviews;
create policy pending_reviews_select_own
on public.pending_reviews
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists pending_reviews_insert_own on public.pending_reviews;
create policy pending_reviews_insert_own
on public.pending_reviews
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

revoke all on table public.pending_reviews from anon, authenticated;
grant select, insert on table public.pending_reviews to authenticated;
grant select, insert, update, delete on table public.pending_reviews to service_role;

revoke all on function public.set_pending_review_owner() from public;
grant execute on function public.set_pending_review_owner() to authenticated, service_role;

commit;
