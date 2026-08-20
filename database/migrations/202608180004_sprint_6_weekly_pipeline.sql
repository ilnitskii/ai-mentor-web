begin;

create table if not exists public.weekly_reports (
  report_id uuid primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  period_start date not null,
  period_end date not null,
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  weak_topics jsonb not null default '[]'::jsonb check (jsonb_typeof(weak_topics) = 'array'),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  algorithm_version text not null default 'mentor-v1',
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (user_id, period_start, period_end, algorithm_version)
);

create table if not exists public.assignments (
  assignment_id uuid primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  report_id uuid not null references public.weekly_reports (report_id) on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'completed', 'archived')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, report_id)
);

create table if not exists public.reviews (
  review_id uuid primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  pending_review_id uuid not null references public.pending_reviews (review_id) on delete cascade,
  score smallint check (score between 0 and 100),
  feedback jsonb not null check (jsonb_typeof(feedback) = 'object'),
  status text not null default 'reviewed'
    check (status in ('reviewed', 'needs_human_review')),
  created_at timestamptz not null default now(),
  unique (user_id, pending_review_id)
);

create index if not exists weekly_reports_user_period_idx
  on public.weekly_reports (user_id, period_end desc);
create index if not exists assignments_user_due_idx
  on public.assignments (user_id, due_at);
create index if not exists reviews_user_created_idx
  on public.reviews (user_id, created_at desc);

alter table public.weekly_reports enable row level security;
alter table public.assignments enable row level security;
alter table public.reviews enable row level security;

drop policy if exists weekly_reports_select_own on public.weekly_reports;
create policy weekly_reports_select_own
on public.weekly_reports for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists assignments_select_own on public.assignments;
create policy assignments_select_own
on public.assignments for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists reviews_select_own on public.reviews;
create policy reviews_select_own
on public.reviews for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

revoke all on table public.weekly_reports from anon, authenticated;
revoke all on table public.assignments from anon, authenticated;
revoke all on table public.reviews from anon, authenticated;
grant select on table public.weekly_reports to authenticated;
grant select on table public.assignments to authenticated;
grant select on table public.reviews to authenticated;
grant select, insert, update, delete on table public.weekly_reports to service_role;
grant select, insert, update, delete on table public.assignments to service_role;
grant select, insert, update, delete on table public.reviews to service_role;

commit;
