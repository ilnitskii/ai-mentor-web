import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";
import { format } from "prettier";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const contentRoot = resolve(projectRoot, "content");
const outputPath = resolve(projectRoot, "apps/web/src/generated/course.json");
const fixturePath = resolve(projectRoot, "fixtures/course.valid.json");

async function filesIn(directory, suffix) {
  return (await readdir(directory))
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => resolve(directory, name));
}

function parseLesson(source, path) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`CONTENT_FRONT_MATTER_INVALID:${path}`);
  const metadata = parseYaml(match[1]);
  return { ...metadata, body: match[2].trim() };
}

function assertUniqueIds(collections) {
  const ids = new Set();
  for (const collection of collections) {
    for (const item of collection) {
      if (!item.id || ids.has(item.id))
        throw new Error(`CONTENT_ID_INVALID:${item.id ?? "missing"}`);
      ids.add(item.id);
    }
  }
}

const lessonPaths = await filesIn(resolve(contentRoot, "lessons"), ".md");
const rawLessons = await Promise.all(
  lessonPaths.map(async (path) =>
    parseLesson(await readFile(path, "utf8"), path),
  ),
);
const lessons = rawLessons.map((lesson) => ({
  id: lesson.id,
  topic_id: lesson.topic_id,
  title: lesson.title,
  body: lesson.body,
  estimated_minutes: lesson.estimated_minutes,
  check: lesson.check ?? null,
  status: lesson.status,
}));

const cardPaths = await filesIn(resolve(contentRoot, "cards"), ".yaml");
const rawCards = (
  await Promise.all(
    cardPaths.map(
      async (path) => parseYaml(await readFile(path, "utf8")).cards,
    ),
  )
).flat();
const cards = rawCards.map((card) => ({
  id: card.id,
  topic_id: card.topic_id,
  prompt: card.prompt,
  answer: card.answer,
  type: card.type ?? "question_answer",
  choices: card.choices ?? [],
  correct_choice_index: card.correct_choice_index ?? null,
  explanation: card.explanation ?? "",
  source_lesson_id: card.source_lesson_id ?? null,
  difficulty: card.difficulty,
  status: card.status,
}));

const taskPaths = await filesIn(resolve(contentRoot, "tasks"), ".yaml");
const tasks = await Promise.all(
  taskPaths.map(async (path) => {
    const task = parseYaml(await readFile(path, "utf8"));
    return {
      id: task.id,
      topic_id: task.topic_id,
      prompt: task.prompt,
      answer_type: task.answer_type ?? task.type,
      options: task.options ?? [],
      checker: task.checker,
      difficulty: task.difficulty,
      estimated_minutes: task.estimated_minutes,
      hints: task.hints,
      reference_solution: task.reference_solution,
      rubric: task.rubric,
      status: task.status,
    };
  }),
);

const topicIds = [
  ...new Set([...lessons, ...cards, ...tasks].map((item) => item.topic_id)),
];
const topics = topicIds.map((id) => {
  const lesson = lessons.find((item) => item.topic_id === id);
  return {
    id,
    title: lesson?.title ?? id,
    prerequisites: [],
    status: "active",
  };
});

assertUniqueIds([topics, lessons, cards, tasks]);

for (const task of tasks) {
  if (!task.checker?.mode)
    throw new Error(`CONTENT_CHECKER_MISSING:${task.id}`);
}

const foundationLesson = lessons.find(
  (item) => item.id === "foundations.data-tables.intro",
);
const foundationCards = cards.filter(
  (item) => item.topic_id === "foundations.data-tables",
);
const defaultTask = tasks.find(
  (item) => item.id === "foundations.data-tables.task-choice",
);
if (!foundationLesson || foundationCards.length < 5 || !defaultTask)
  throw new Error("CONTENT_DAILY_PLAN_INCOMPLETE");

const course = {
  schema_version: 1,
  profile_id: "default",
  topics,
  lessons,
  cards,
  tasks,
  daily_plan: {
    date: "2026-08-18",
    target_minutes: 25,
    rationale:
      "Определите зерно таблицы, закрепите понятия карточками и решите одну задачу выбранного типа.",
    items: [
      { item_id: foundationLesson.id, type: "lesson" },
      ...foundationCards.map((card) => ({ item_id: card.id, type: "card" })),
      { item_id: defaultTask.id, type: "task" },
    ],
  },
};

const serialized = await format(JSON.stringify(course), { parser: "json" });
await Promise.all([
  writeFile(outputPath, serialized, "utf8"),
  writeFile(fixturePath, serialized, "utf8"),
]);
console.log(
  `Built web content: ${lessons.length} lessons, ${cards.length} cards, ${tasks.length} tasks`,
);
