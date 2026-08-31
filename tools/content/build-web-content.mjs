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

function choiceOptions(value, expectedAnswers, label) {
  if (!Array.isArray(value) || value.length < 2)
    throw new Error(`CONTENT_CHOICE_OPTIONS:${label}`);
  if (!value.every((option) => typeof option === "string" && option.trim()))
    throw new Error(`CONTENT_CHOICE_OPTION_INVALID:${label}`);
  if (!expectedAnswers.some((answer) => value.includes(answer)))
    throw new Error(`CONTENT_CHOICE_ANSWER_MISSING:${label}`);
  return value;
}

function rotateChoices(value, offset) {
  const position = offset % value.length;
  return [...value.slice(position), ...value.slice(0, position)];
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
    const lessonSourceOptions = choiceOptions(
      day.check_options,
      [day.check_options?.[0]],
      `${lessonId}.check`,
    );
    lessons.push({
      id: lessonId,
      topic_id: topicId,
      title: day.title,
      body: required(day.body, `${lessonId}.body`).trim(),
      estimated_minutes: day.minutes,
      check: {
        question: day.check_question,
        options: rotateChoices(lessonSourceOptions, week.week + day.day),
        rule: {
          mode: "normalized",
          expected_answers: [lessonSourceOptions[0], ...day.check_answers],
        },
      },
      status: "active",
    });
    if (!Array.isArray(day.knowledge) || day.knowledge.length !== 5)
      throw new Error(`CONTENT_CARD_COUNT:${topicId}`);
    const knowledgeAnswers = day.knowledge.map(([, answer]) => answer);
    day.knowledge.forEach(([prompt, answer, explanation], index) => {
      const id = `${topicId}.card-${String(index + 1).padStart(3, "0")}`;
      const distractors = [
        knowledgeAnswers[(index + 1) % knowledgeAnswers.length],
        knowledgeAnswers[(index + 2) % knowledgeAnswers.length],
      ];
      const correctChoiceIndex = index % 3;
      const choices = [...distractors];
      choices.splice(correctChoiceIndex, 0, answer);
      cardIds.push(id);
      cards.push({
        id,
        topic_id: topicId,
        prompt,
        answer,
        type: "multiple_choice",
        choices,
        correct_choice_index: correctChoiceIndex,
        explanation,
        source_lesson_id: lessonId,
        difficulty: index < 3 ? "easy" : "medium",
        status: "active",
      });
    });
    const task = day.task;
    if (task.answer_type !== "choice")
      throw new Error(`CONTENT_OPEN_ANSWER_FORBIDDEN:${taskId}`);
    tasks.push({
      id: taskId,
      topic_id: topicId,
      prompt: task.prompt,
      answer_type: task.answer_type,
      options: rotateChoices(
        choiceOptions(task.options, task.expected, taskId),
        week.week + day.day,
      ),
      checker: {
        mode: "exact",
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
    answer_type: "choice",
    options: rotateChoices(
      choiceOptions(week.project.options, week.project.expected, projectId),
      week.week,
    ),
    checker: { mode: "exact", expected_answers: week.project.expected },
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
