import courseJson from "../generated/course.json";
import type { Course } from "./types";

export const course = courseJson as Course;

export const foundationLesson = course.lessons.find(
  (lesson) => lesson.id === "foundations.data-tables.intro",
)!;

export const foundationCards = course.cards.filter(
  (card) => card.topic_id === "foundations.data-tables",
);

export const foundationTasks = course.tasks.filter(
  (task) => task.topic_id === "foundations.data-tables",
);
