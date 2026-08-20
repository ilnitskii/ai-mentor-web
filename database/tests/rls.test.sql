begin;

create extension if not exists pgtap with schema extensions;
select plan(62);

-- Seed is loaded by `supabase test db`; these upserts also make the test standalone.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'alice@example.test', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bob@example.test', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

select is(
  (select count(*) from public.profiles where user_id in (
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002'
  )),
  2::bigint,
  'auth trigger creates one profile per new user'
);
select is(
  (select display_name from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  'Ученик'::text,
  'auth trigger uses a safe display-name fallback'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'insert'),
  'browser cannot create profiles outside the auth trigger'
);

insert into public.profiles (user_id, goal)
values
  ('10000000-0000-4000-8000-000000000001', 'Alice synthetic goal'),
  ('20000000-0000-4000-8000-000000000002', 'Bob synthetic goal')
on conflict (user_id) do nothing;

insert into public.progress_events (
  event_id, user_id, device_id, item_id, event_type, occurred_at, timezone, payload
)
values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'alice-device', 'alice-item', 'lesson_completed', now(), 'UTC', '{}'::jsonb),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'bob-device', 'bob-item', 'task_submitted', now(), 'UTC', '{}'::jsonb)
on conflict (event_id) do nothing;

insert into public.mastery_snapshots (
  user_id, topic_id, score, evidence_count, recent_accuracy, algorithm_version, as_of
)
values
  ('10000000-0000-4000-8000-000000000001', 'alice-topic', 40, 1, 1, 'progress-v1', now()),
  ('20000000-0000-4000-8000-000000000002', 'bob-topic', 20, 1, 0, 'progress-v1', now())
on conflict (user_id, topic_id, algorithm_version) do nothing;

insert into public.card_states (
  user_id, card_id, due_at, stability, difficulty, last_event_id, algorithm_version
)
values
  ('10000000-0000-4000-8000-000000000001', 'alice-card', now(), 1, 5, '11000000-0000-4000-8000-000000000001', 'progress-v1'),
  ('20000000-0000-4000-8000-000000000002', 'bob-card', now(), 1, 5, '22000000-0000-4000-8000-000000000002', 'progress-v1')
on conflict (user_id, card_id, algorithm_version) do nothing;

insert into public.weekly_reports (
  report_id, user_id, period_start, period_end, summary, weak_topics
)
values (
  '81000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '2026-08-10', '2026-08-16', '{"synthetic":true}'::jsonb, '[]'::jsonb
)
on conflict (report_id) do nothing;

insert into public.assignments (
  assignment_id, user_id, report_id, content, due_at
)
values (
  '82000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '{"synthetic":true}'::jsonb, now() + interval '7 days'
)
on conflict (assignment_id) do nothing;

select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anonymous cannot select profiles');
select ok(not has_table_privilege('anon', 'public.progress_events', 'select'), 'anonymous cannot select progress events');
select ok(not has_table_privilege('anon', 'public.pipeline_runs', 'select'), 'anonymous cannot select pipeline runs');
select ok(not has_table_privilege('anon', 'public.pending_reviews', 'select'), 'anonymous cannot select pending reviews');
select ok(not has_table_privilege('anon', 'public.mastery_snapshots', 'select'), 'anonymous cannot select mastery snapshots');
select ok(not has_table_privilege('anon', 'public.card_states', 'select'), 'anonymous cannot select card states');
select ok(not has_table_privilege('anon', 'public.weekly_reports', 'select'), 'anonymous cannot select weekly reports');
select ok(not has_table_privilege('anon', 'public.assignments', 'select'), 'anonymous cannot select assignments');
select ok(not has_table_privilege('anon', 'public.reviews', 'select'), 'anonymous cannot select reviews');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.profiles), 1::bigint, 'Alice sees one profile');
select is((select count(*) from public.profiles where user_id = '20000000-0000-4000-8000-000000000002'), 0::bigint, 'Alice cannot read Bob profile');
select results_eq(
  $$update public.profiles set goal = 'not allowed' where user_id = '20000000-0000-4000-8000-000000000002' returning user_id$$,
  $$select null::uuid where false$$,
  'Alice cannot update Bob profile'
);
select is((select count(*) from public.progress_events), 1::bigint, 'Alice sees only her progress events');
select results_eq(
  $$insert into public.progress_events (event_id, user_id, device_id, item_id, event_type, occurred_at, timezone, payload) values ('33000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'spoof-device', 'spoof-item', 'lesson_completed', now(), 'UTC', '{}'::jsonb) returning user_id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$,
  'event owner is fixed from Alice JWT'
);
select ok(not has_table_privilege('authenticated', 'public.progress_events', 'update'), 'browser cannot update progress events');
select ok(not has_table_privilege('authenticated', 'public.progress_events', 'delete'), 'browser cannot delete progress events');
select results_eq(
  $$insert into public.pending_reviews (review_id, attempt_id, user_id, task_id, answer) values ('44000000-0000-4000-8000-000000000004', '44000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'synthetic-task', 'synthetic answer') returning user_id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$,
  'pending review owner is fixed from Alice JWT'
);
select is((select count(*) from public.pending_reviews), 1::bigint, 'Alice sees her pending review');
select ok(not has_table_privilege('authenticated', 'public.pending_reviews', 'update'), 'browser cannot update pending reviews');
select ok(not has_table_privilege('authenticated', 'public.pending_reviews', 'delete'), 'browser cannot delete pending reviews');
select is((select count(*) from public.mastery_snapshots), 1::bigint, 'Alice sees one mastery snapshot');
select is((select count(*) from public.mastery_snapshots where user_id = '20000000-0000-4000-8000-000000000002'), 0::bigint, 'Alice cannot read Bob mastery');
select is((select count(*) from public.card_states), 1::bigint, 'Alice sees one card state');
select results_eq(
  $$update public.mastery_snapshots set score = 99 where user_id = '20000000-0000-4000-8000-000000000002' returning user_id$$,
  $$select null::uuid where false$$,
  'Alice cannot update Bob mastery'
);
select results_eq(
  $$insert into public.mastery_snapshots (user_id, topic_id, score, evidence_count, algorithm_version, as_of) values ('20000000-0000-4000-8000-000000000002', 'spoof-topic', 10, 1, 'progress-v1', now()) returning user_id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$,
  'mastery owner is fixed from Alice JWT'
);
select results_eq(
  $$insert into public.card_states (user_id, card_id, due_at, stability, difficulty, last_event_id, algorithm_version) values ('20000000-0000-4000-8000-000000000002', 'spoof-card', now(), 1, 5, '33000000-0000-4000-8000-000000000003', 'progress-v1') returning user_id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$,
  'card state owner is fixed from Alice JWT'
);
select is((select count(*) from public.weekly_reports), 1::bigint, 'Alice sees her weekly report');
select is((select count(*) from public.assignments), 1::bigint, 'Alice sees her assignment');
select is((select count(*) from public.reviews), 0::bigint, 'Alice has no published reviews yet');
select ok(not has_table_privilege('authenticated', 'public.weekly_reports', 'insert'), 'browser cannot publish reports');
select ok(
  not has_function_privilege('authenticated', 'public.publish_weekly_bundle(uuid,uuid,jsonb,jsonb,jsonb,jsonb)', 'execute'),
  'browser cannot execute transactional publish'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.profiles), 1::bigint, 'Bob sees one profile');
select is((select count(*) from public.progress_events where user_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'Bob cannot read Alice events');
select is((select count(*) from public.pending_reviews), 0::bigint, 'Bob cannot read Alice pending reviews');
select is((select count(*) from public.mastery_snapshots where user_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'Bob cannot read Alice mastery');
select is((select count(*) from public.card_states where user_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'Bob cannot read Alice card states');
select is((select count(*) from public.weekly_reports where user_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'Bob cannot read Alice reports');
select is((select count(*) from public.assignments where user_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'Bob cannot read Alice assignments');
select ok(not has_table_privilege('authenticated', 'public.pipeline_runs', 'select'), 'browser cannot read pipeline runs');

reset role;
set local role service_role;
insert into public.reviews (review_id, user_id, pending_review_id, score, feedback)
values (
  '83000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000004',
  80, '{"synthetic":true}'::jsonb
)
on conflict (review_id) do nothing;
select is(
  (select published from public.publish_weekly_bundle(
    '85000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    '{"db_report_id":"81000000-0000-4000-8000-000000000001","period_start":"2026-08-10","period_end":"2026-08-16","summary":"synthetic","weak_topics":[]}'::jsonb,
    '{"db_assignment_id":"82000000-0000-4000-8000-000000000002","title":"synthetic","due_at":null}'::jsonb,
    '[]'::jsonb,
    '{"received_at":"2026-08-18T09:00:01Z","event_id":"72000000-0000-4000-8000-000000000002"}'::jsonb
  )),
  true,
  'service role publishes one transactional bundle'
);
select is(
  (select published from public.publish_weekly_bundle(
    '85000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    '{"db_report_id":"81000000-0000-4000-8000-000000000001","period_start":"2026-08-10","period_end":"2026-08-16","summary":"synthetic","weak_topics":[]}'::jsonb,
    '{"db_assignment_id":"82000000-0000-4000-8000-000000000002","title":"synthetic","due_at":null}'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb
  )),
  false,
  'same idempotency run does not publish twice'
);
select is((select count(*) from public.assignments), 1::bigint, 'repeat period does not create a second assignment');
select is((select count(*) from public.pipeline_runs where run_id = '85000000-0000-4000-8000-000000000005'), 1::bigint, 'published cursor is recorded once');
select is((select count(*) from public.profiles), 2::bigint, 'admin sees both profiles');
select is((select count(*) from public.progress_events), 3::bigint, 'admin sees every progress event');
select is((select count(*) from public.pending_reviews), 1::bigint, 'admin sees pending reviews');
select ok(has_table_privilege('service_role', 'public.pipeline_runs', 'insert'), 'admin can record pipeline runs');
select ok(has_table_privilege('service_role', 'public.pending_reviews', 'update'), 'admin can review pending answers');
select is((select count(*) from public.mastery_snapshots), 3::bigint, 'admin sees every mastery snapshot');
select is((select count(*) from public.card_states), 3::bigint, 'admin sees every card state');
select ok(has_table_privilege('service_role', 'public.mastery_snapshots', 'insert'), 'admin can rebuild mastery');
select ok(has_table_privilege('service_role', 'public.card_states', 'insert'), 'admin can rebuild card states');
select is((select count(*) from public.weekly_reports), 1::bigint, 'admin sees weekly reports');
select is((select count(*) from public.assignments), 1::bigint, 'admin sees assignments');
select is((select count(*) from public.reviews), 1::bigint, 'admin sees reviews');
select ok(has_table_privilege('service_role', 'public.weekly_reports', 'insert'), 'admin can publish reports');
select ok(has_table_privilege('service_role', 'public.assignments', 'insert'), 'admin can publish assignments');
select ok(has_table_privilege('service_role', 'public.reviews', 'insert'), 'admin can publish reviews');
select is(
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('profiles', 'progress_events', 'pipeline_runs', 'pending_reviews', 'mastery_snapshots', 'card_states', 'weekly_reports', 'assignments', 'reviews') and relrowsecurity),
  9::bigint,
  'RLS is enabled on every user-data table'
);

select * from finish();
rollback;
