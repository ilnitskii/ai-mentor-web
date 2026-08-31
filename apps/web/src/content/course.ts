import courseJson from "../generated/course.json";
import type { Course } from "./types";

export const course = courseJson as Course;

export function isSupportedCourse(value: unknown): value is Course {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Course>;
  return (
    candidate.schema_version === 1 &&
    candidate.track_id === "data-analytics.zero-to-job" &&
    typeof candidate.release_version === "number" &&
    Array.isArray(candidate.topics) &&
    Array.isArray(candidate.lessons) &&
    Array.isArray(candidate.cards) &&
    Array.isArray(candidate.tasks) &&
    Array.isArray(candidate.weeks) &&
    candidate.weeks.length > 0 &&
    candidate.weeks[0].days.length > 0
  );
}

export function getSessionContent(
  value: Course,
  requestedWeek?: number,
  requestedDay?: number,
) {
  const week =
    value.weeks.find((item) => item.week === requestedWeek) ?? value.weeks[0];
  const day =
    week.days.find((item) => item.day === requestedDay) ?? week.days[0];
  const lesson = value.lessons.find((item) => item.id === day.lesson_id);
  const cards = value.cards.filter((item) => day.card_ids.includes(item.id));
  const tasks = value.tasks.filter((item) => day.task_ids.includes(item.id));
  if (!lesson || cards.length < 5 || tasks.length < 1) {
    throw new Error("COURSE_SESSION_INVALID");
  }
  return { week, day, lesson, cards, tasks };
}

export function getFirstSessionContent(value: Course) {
  return getSessionContent(value);
}

const firstSession = getFirstSessionContent(course);
export const foundationLesson = firstSession.lesson;
export const foundationCards = firstSession.cards;
export const foundationTasks = firstSession.tasks;
