import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationsDirectory = fileURLToPath(
  new URL("../../database/migrations/", import.meta.url),
);
const seedPath = new URL(
  "../../database/seed/synthetic.sql",
  import.meta.url,
);

const aliceId = "10000000-0000-4000-8000-000000000001";
const bobId = "20000000-0000-4000-8000-000000000002";
const db = new PGlite();

async function scalar(sql, params = []) {
  const result = await db.query(sql, params);
  return Object.values(result.rows[0] ?? {})[0];
}

async function setRole(role, userId = null) {
  await db.exec("reset role");
  if (userId) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      userId,
    ]);
  } else {
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
  }
  await db.exec(`set role ${role}`);
}

async function expectDenied(sql, message) {
  await assert.rejects(
    db.exec(sql),
    (error) => error && error.code === "42501",
    message,
  );
}

try {
  await db.exec(`
    create schema auth;
    create table auth.users (
      instance_id uuid,
      id uuid primary key,
      aud varchar,
      role varchar,
      email varchar,
      raw_app_meta_data jsonb,
      raw_user_meta_data jsonb,
      email_confirmed_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz
    );
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role supabase_auth_admin nologin;
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const migrations = await Promise.all(
    migrationFiles.map((name) =>
      readFile(resolve(migrationsDirectory, name), "utf8"),
    ),
  );
  const seed = await readFile(seedPath, "utf8");

  for (const migration of migrations) await db.exec(migration);
  for (const migration of migrations) await db.exec(migration);
  await db.exec(seed);
  await db.exec(`
    insert into public.weekly_reports
      (report_id, user_id, period_start, period_end, summary, weak_topics)
    values
      ('81000000-0000-4000-8000-000000000001', '${aliceId}',
       '2026-08-10', '2026-08-16', '{"synthetic":true}'::jsonb, '[]'::jsonb);
    insert into public.assignments
      (assignment_id, user_id, report_id, content)
    values
      ('82000000-0000-4000-8000-000000000002', '${aliceId}',
       '81000000-0000-4000-8000-000000000001', '{"synthetic":true}'::jsonb);
  `);

  await setRole("anon");
  await expectDenied("select * from public.profiles", "anonymous profiles read");
  await expectDenied(
    "select * from public.progress_events",
    "anonymous progress read",
  );
  await expectDenied(
    "select * from public.pipeline_runs",
    "anonymous pipeline read",
  );
  await expectDenied(
    "select * from public.pending_reviews",
    "anonymous pending reviews read",
  );
  await expectDenied(
    "select * from public.mastery_snapshots",
    "anonymous mastery read",
  );
  await expectDenied(
    "select * from public.card_states",
    "anonymous card states read",
  );
  await expectDenied(
    "select * from public.weekly_reports",
    "anonymous weekly reports read",
  );
  await expectDenied(
    "select * from public.assignments",
    "anonymous assignments read",
  );
  await expectDenied("select * from public.reviews", "anonymous reviews read");

  await setRole("authenticated", aliceId);
  assert.equal(
    await scalar("select count(*)::int from public.profiles"),
    1,
    "Alice sees only her profile",
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.profiles where user_id = $1",
      [bobId],
    ),
    0,
    "Alice cannot read Bob profile",
  );
  assert.equal(
    (
      await db.query(
        "update public.profiles set goal = 'blocked' where user_id = $1 returning user_id",
        [bobId],
      )
    ).rows.length,
    0,
    "Alice cannot update Bob profile",
  );
  assert.equal(
    await scalar("select count(*)::int from public.progress_events"),
    1,
    "Alice sees only her events",
  );
  const spoofed = await db.query(
    `insert into public.progress_events
      (event_id, user_id, device_id, item_id, event_type, occurred_at, timezone, payload)
     values
      ('33000000-0000-4000-8000-000000000003', $1, 'spoof-device', 'spoof-item',
       'lesson_completed', now(), 'UTC', '{}'::jsonb)
     returning user_id`,
    [bobId],
  );
  assert.equal(
    spoofed.rows[0].user_id,
    aliceId,
    "event owner comes from Alice JWT",
  );
  await expectDenied(
    "update public.progress_events set payload = '{}'::jsonb",
    "browser event update",
  );
  await expectDenied(
    "delete from public.progress_events",
    "browser event delete",
  );
  await expectDenied(
    "select * from public.pipeline_runs",
    "browser pipeline read",
  );
  const pendingReview = await db.query(
    `insert into public.pending_reviews
      (review_id, attempt_id, user_id, task_id, answer)
     values
      ('44000000-0000-4000-8000-000000000004',
       '44000000-0000-4000-8000-000000000005', $1,
       'synthetic-task', 'synthetic answer')
     returning user_id`,
    [bobId],
  );
  assert.equal(pendingReview.rows[0].user_id, aliceId);
  await expectDenied(
    "update public.pending_reviews set status = 'reviewed'",
    "browser pending review update",
  );
  await expectDenied(
    "delete from public.pending_reviews",
    "browser pending review delete",
  );
  const mastery = await db.query(
    `insert into public.mastery_snapshots
      (user_id, topic_id, score, evidence_count, algorithm_version, as_of)
     values ($1, 'synthetic-topic', 40, 1, 'progress-v1', now())
     returning user_id`,
    [bobId],
  );
  assert.equal(mastery.rows[0].user_id, aliceId);
  const cardState = await db.query(
    `insert into public.card_states
      (user_id, card_id, due_at, stability, difficulty, last_event_id, algorithm_version)
     values ($1, 'synthetic-card', now(), 1, 5,
       '33000000-0000-4000-8000-000000000003', 'progress-v1')
     returning user_id`,
    [bobId],
  );
  assert.equal(cardState.rows[0].user_id, aliceId);
  assert.equal(
    await scalar("select count(*)::int from public.weekly_reports"),
    1,
    "Alice sees her weekly report",
  );
  assert.equal(
    await scalar("select count(*)::int from public.assignments"),
    1,
    "Alice sees her assignment",
  );
  await expectDenied(
    `insert into public.weekly_reports
      (report_id, user_id, period_start, period_end, summary)
     values
      ('84000000-0000-4000-8000-000000000004', '${aliceId}',
       '2026-08-17', '2026-08-18', '{}'::jsonb)`,
    "browser report publish",
  );

  await setRole("authenticated", bobId);
  assert.equal(
    await scalar("select count(*)::int from public.profiles"),
    1,
    "Bob sees only his profile",
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.progress_events where user_id = $1",
      [aliceId],
    ),
    0,
    "Bob cannot read Alice events",
  );
  assert.equal(
    await scalar("select count(*)::int from public.pending_reviews"),
    0,
    "Bob cannot read Alice pending reviews",
  );
  assert.equal(
    await scalar("select count(*)::int from public.mastery_snapshots"),
    0,
    "Bob cannot read Alice mastery",
  );
  assert.equal(
    await scalar("select count(*)::int from public.card_states"),
    0,
    "Bob cannot read Alice card states",
  );
  assert.equal(
    await scalar("select count(*)::int from public.weekly_reports"),
    0,
    "Bob cannot read Alice reports",
  );
  assert.equal(
    await scalar("select count(*)::int from public.assignments"),
    0,
    "Bob cannot read Alice assignments",
  );

  await setRole("service_role");
  await db.exec(`
    insert into public.reviews
      (review_id, user_id, pending_review_id, score, feedback)
    values
      ('83000000-0000-4000-8000-000000000003', '${aliceId}',
       '44000000-0000-4000-8000-000000000004', 80, '{"synthetic":true}'::jsonb);
  `);
  assert.equal(
    await scalar("select count(*)::int from public.profiles"),
    2,
    "admin sees both profiles",
  );
  assert.equal(
    await scalar("select count(*)::int from public.progress_events"),
    3,
    "admin sees every event",
  );
  assert.equal(
    await scalar("select count(*)::int from public.pending_reviews"),
    1,
    "admin sees pending reviews",
  );
  assert.equal(
    await scalar("select count(*)::int from public.mastery_snapshots"),
    1,
    "admin sees mastery projections",
  );
  assert.equal(
    await scalar("select count(*)::int from public.card_states"),
    1,
    "admin sees card state projections",
  );
  assert.equal(
    await scalar("select count(*)::int from public.weekly_reports"),
    1,
    "admin sees weekly reports",
  );
  assert.equal(
    await scalar("select count(*)::int from public.assignments"),
    1,
    "admin sees assignments",
  );
  assert.equal(
    await scalar("select count(*)::int from public.reviews"),
    1,
    "admin sees reviews",
  );
  assert.equal(
    await scalar(`
      select count(*)::int
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relname in ('profiles', 'progress_events', 'pipeline_runs', 'pending_reviews',
                        'mastery_snapshots', 'card_states', 'weekly_reports',
                        'assignments', 'reviews')
        and relrowsecurity
    `),
    9,
    "RLS is enabled on every user-data table",
  );

  console.log(`Database migration and RLS checks passed (${projectRoot})`);
} finally {
  await db.close();
}
