import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const apply = process.argv.includes("--apply");
const coursePath = resolve("apps/web/src/generated/course.json");
const course = JSON.parse(await readFile(coursePath, "utf8"));
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) throw new Error("COURSE_PUBLISH_ENV_MISSING");
if (course.schema_version !== 1 || !Array.isArray(course.weeks))
  throw new Error("COURSE_SCHEMA_UNSUPPORTED");
if (course.weeks.length !== course.end_week - course.start_week + 1)
  throw new Error("COURSE_WEEK_RANGE_INVALID");

const entityCounts = {
  topics: course.topics.length,
  lessons: course.lessons.length,
  cards: course.cards.length,
  tasks: course.tasks.length,
};
const compact = JSON.stringify(course);
const hash = createHash("sha256").update(compact).digest("hex");
const headers = { apikey: secret, "Content-Type": "application/json" };
if (secret.startsWith("eyJ")) headers.Authorization = `Bearer ${secret}`;

const query = new URL(`${url}/rest/v1/course_releases`);
query.searchParams.set("track_id", `eq.${course.track_id}`);
query.searchParams.set(
  "select",
  "track_id,release_version,content_sha256,status,published_at",
);
const inspection = await fetch(query, { headers });
if (!inspection.ok && inspection.status !== 404)
  throw new Error(`COURSE_INSPECTION_FAILED:${inspection.status}`);
const existing = inspection.ok ? await inspection.json() : [];

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      track_id: course.track_id,
      release_version: course.release_version,
      weeks: [course.start_week, course.end_week],
      entities: entityCounts,
      sha256: hash,
      existing_releases: existing.map(
        ({ release_version, content_sha256, status }) => ({
          release_version,
          content_sha256,
          status,
        }),
      ),
    },
    null,
    2,
  ),
);

if (!apply) process.exit(0);
if (!inspection.ok) throw new Error("COURSE_RELEASE_TABLE_MISSING");

const response = await fetch(`${url}/rest/v1/rpc/publish_course_release`, {
  method: "POST",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify({
    p_track_id: course.track_id,
    p_release_version: course.release_version,
    p_schema_version: course.schema_version,
    p_title: course.title,
    p_start_week: course.start_week,
    p_end_week: course.end_week,
    p_content: course,
    p_content_sha256: hash,
  }),
});
if (!response.ok) throw new Error(`COURSE_PUBLISH_FAILED:${response.status}`);
const result = await response.json();
console.log(JSON.stringify({ published: true, result }, null, 2));
