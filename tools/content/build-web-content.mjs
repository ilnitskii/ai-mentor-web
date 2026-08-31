import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { format } from "prettier";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const releasePath = resolve(
  projectRoot,
  "content/releases/data-analyst-zero.weeks-01-04.yaml",
);
const outputPath = resolve(projectRoot, "apps/web/src/generated/course.json");
const fixturePath = resolve(projectRoot, "fixtures/course.valid.json");
const release = parseYaml(await readFile(releasePath, "utf8"));

function required(value, label) {
  if (value === undefined || value === null || value === "")
    throw new Error(`CONTENT_REQUIRED:${label}`);
  return value;
}

function assertUniqueIds(collections) {
  const ids = new Set();
  for (const collection of collections)
    for (const item of collection) {
      if (!item.id || ids.has(item.id))
        throw new Error(`CONTENT_ID_INVALID:${item.id ?? "missing"}`);
      ids.add(item.id);
    }
}

const topics = [];
const lessons = [];
const cards = [];
const tasks = [];
const weeks = [];
let previousTopicId = null;

for (const week of release.weeks) {
  const plannedDays = [];
  for (const day of week.days) {
    const topicId = required(day.topic_id, `week-${week.week}.day-${day.day}`);
    const lessonId = `${topicId}.lesson`;
    const taskId = `${topicId}.task`;
    const cardIds = [];
    topics.push({
      id: topicId,
      title: day.title,
      prerequisites: previousTopicId ? [previousTopicId] : [],
      status: "active",
    });
    lessons.push({
      id: lessonId,
      topic_id: topicId,
      title: day.title,
      body: required(day.body, `${lessonId}.body`).trim(),
      estimated_minutes: day.minutes,
      check: {
        question: day.check_question,
        rule: { mode: "normalized", expected_answers: day.check_answers },
      },
      status: "active",
    });
    if (!Array.isArray(day.knowledge) || day.knowledge.length !== 5)
      throw new Error(`CONTENT_CARD_COUNT:${topicId}`);
    day.knowledge.forEach(([prompt, answer, explanation], index) => {
      const id = `${topicId}.card-${String(index + 1).padStart(3, "0")}`;
      cardIds.push(id);
      cards.push({
        id,
        topic_id: topicId,
        prompt,
        answer,
        type: "question_answer",
        choices: [],
        correct_choice_index: null,
        explanation,
        source_lesson_id: lessonId,
        difficulty: index < 3 ? "easy" : "medium",
        status: "active",
      });
    });
    const task = day.task;
    tasks.push({
      id: taskId,
      topic_id: topicId,
      prompt: task.prompt,
      answer_type: task.answer_type,
      options: task.options ?? [],
      checker: {
        mode: task.answer_type === "choice" ? "exact" : "normalized",
        expected_answers: task.expected,
      },
      difficulty: "medium",
      estimated_minutes: week.week === 1 ? 35 : 45,
      hints: [
        "Сначала сформулируйте, какой факт или правило проверяется.",
        "Сверьте ответ с определениями и контрольным примером из урока.",
      ],
      reference_solution: task.reference,
      rubric: [
        { criterion: "Ответ соответствует условию", points: 70 },
        { criterion: "Ход решения можно проверить", points: 30 },
      ],
      status: "active",
    });
    plannedDays.push({
      day: day.day,
      lesson_id: lessonId,
      card_ids: cardIds,
      task_ids: [taskId],
      target_minutes: week.week === 1 ? 50 : 60,
    });
    previousTopicId = topicId;
  }
  const projectId = `${week.project.topic_id}.project-week-${String(week.week).padStart(2, "0")}`;
  tasks.push({
    id: projectId,
    topic_id: week.project.topic_id,
    prompt: week.project.prompt,
    answer_type: "text",
    options: [],
    checker: { mode: "pending_review", expected_answers: [] },
    difficulty: "hard",
    estimated_minutes: 180,
    hints: [
      "Начните с результата и критериев приёмки, затем перечислите проверки.",
      "Сохраните исходные данные и отделите их от преобразований и отчёта.",
    ],
    reference_solution: week.project.reference,
    rubric: [
      { criterion: "Корректность данных и контрольные проверки", points: 40 },
      { criterion: "Воспроизводимость результата", points: 30 },
      { criterion: "Обоснованность вывода", points: 30 },
    ],
    status: "active",
  });
  weeks.push({
    week: week.week,
    title: week.title,
    outcome: week.outcome,
    days: plannedDays,
    project_task_id: projectId,
  });
}

assertUniqueIds([topics, lessons, cards, tasks]);
const firstDay = weeks[0].days[0];
const course = {
  schema_version: release.schema_version,
  profile_id: "default",
  track_id: release.track_id,
  release_version: release.release_version,
  title: release.title,
  start_week: release.start_week,
  end_week: release.end_week,
  topics,
  lessons,
  cards,
  tasks,
  weeks,
  daily_plan: {
    date: "2026-08-31",
    target_minutes: firstDay.target_minutes,
    rationale: "Начните с понятий строки, столбца и зерна таблицы.",
    items: [
      { item_id: firstDay.lesson_id, type: "lesson" },
      ...firstDay.card_ids.map((item_id) => ({ item_id, type: "card" })),
      { item_id: firstDay.task_ids[0], type: "task" },
    ],
  },
};
const serialized = await format(JSON.stringify(course), { parser: "json" });
await Promise.all([
  writeFile(outputPath, serialized, "utf8"),
  writeFile(fixturePath, serialized, "utf8"),
]);
console.log(
  `Built release ${release.track_id}@${release.release_version}: ${weeks.length} weeks, ${lessons.length} lessons, ${cards.length} cards, ${tasks.length} tasks`,
);
