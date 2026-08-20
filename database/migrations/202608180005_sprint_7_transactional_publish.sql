begin;

create or replace function public.publish_weekly_bundle(
  p_run_id uuid,
  p_user_id uuid,
  p_report jsonb,
  p_assignment jsonb,
  p_reviews jsonb,
  p_input_cursor jsonb
)
returns table (published boolean)
language plpgsql
set search_path = ''
as $$
declare
  review_item jsonb;
  report_uuid uuid := (p_report ->> 'db_report_id')::uuid;
begin
  if exists (select 1 from public.pipeline_runs where run_id = p_run_id) then
    return query select false;
    return;
  end if;

  insert into public.weekly_reports (
    report_id, user_id, period_start, period_end, summary, weak_topics,
    status, algorithm_version
  ) values (
    report_uuid,
    p_user_id,
    (p_report ->> 'period_start')::date,
    (p_report ->> 'period_end')::date,
    p_report - 'db_report_id' - 'weak_topics',
    coalesce(p_report -> 'weak_topics', '[]'::jsonb),
    'published',
    'mentor-v1'
  )
  on conflict (user_id, period_start, period_end, algorithm_version) do nothing;

  select report_id into report_uuid
  from public.weekly_reports
  where user_id = p_user_id
    and period_start = (p_report ->> 'period_start')::date
    and period_end = (p_report ->> 'period_end')::date
    and algorithm_version = 'mentor-v1';

  insert into public.assignments (
    assignment_id, user_id, report_id, content, status, due_at
  ) values (
    (p_assignment ->> 'db_assignment_id')::uuid,
    p_user_id,
    report_uuid,
    p_assignment - 'db_assignment_id' - 'due_at',
    'assigned',
    nullif(p_assignment ->> 'due_at', '')::timestamptz
  )
  on conflict (user_id, report_id) do nothing;

  for review_item in select value from jsonb_array_elements(coalesce(p_reviews, '[]'))
  loop
    insert into public.reviews (
      review_id, user_id, pending_review_id, score, feedback, status
    ) values (
      (review_item ->> 'db_review_id')::uuid,
      p_user_id,
      (review_item ->> 'pending_review_id')::uuid,
      (review_item ->> 'score')::smallint,
      review_item - 'db_review_id' - 'pending_review_id' - 'score' - 'status',
      coalesce(review_item ->> 'status', 'reviewed')
    )
    on conflict (user_id, pending_review_id) do nothing;

    update public.pending_reviews
    set status = 'reviewed', reviewed_at = now()
    where review_id = (review_item ->> 'pending_review_id')::uuid
      and user_id = p_user_id;
  end loop;

  insert into public.pipeline_runs (
    run_id, user_id, status, input_cursor, started_at, finished_at
  ) values (
    p_run_id, p_user_id, 'published', p_input_cursor, now(), now()
  );

  return query select true;
end;
$$;

revoke all on function public.publish_weekly_bundle(uuid, uuid, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_weekly_bundle(uuid, uuid, jsonb, jsonb, jsonb, jsonb)
  to service_role;

commit;
