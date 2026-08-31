import { Link } from "react-router-dom";

import { useCourse } from "../../content/useCourse";
import type { BackendServices } from "../../data/backendServices";
import { Card } from "../../ui/Card";
import { useProgressProjection } from "../progress/useProgressProjection";

export function LearnPage({ services }: { services: BackendServices }) {
  const course = useCourse(services);
  const { projection, loading } = useProgressProjection(services);
  const lessonIds = new Set(course.lessons.map((lesson) => lesson.id));
  const completedLessonIds = new Set(
    projection?.topics.flatMap((topic) =>
      topic.evidence
        .map((evidence) => evidence.itemId)
        .filter((itemId) => lessonIds.has(itemId)),
    ) ?? [],
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Карта навыков</p>
          <h1>Учиться</h1>
          <p className="lede">
            {course.title}: {course.weeks.length} недели,{" "}
            {course.lessons.length} уроков.
          </p>
          <p className="course-completion" aria-live="polite">
            {loading
              ? "Загружаем прогресс…"
              : `Завершено ${completedLessonIds.size} из ${course.lessons.length}`}
          </p>
        </div>
      </header>
      <div className="course-weeks">
        {course.weeks.map((week) => (
          <Card className="course-week" key={week.week}>
            <div className="course-week-heading">
              <span className="topic-number green">
                {String(week.week).padStart(2, "0")}
              </span>
              <div>
                <p className="eyebrow">Неделя {week.week}</p>
                <h2>{week.title}</h2>
                <p>{week.outcome}</p>
                {!loading && (
                  <p className="week-completion">
                    Завершено{" "}
                    {
                      week.days.filter((day) =>
                        completedLessonIds.has(day.lesson_id),
                      ).length
                    }{" "}
                    из {week.days.length}
                  </p>
                )}
              </div>
            </div>
            <ol className="course-lessons">
              {week.days.map((day) => {
                const lesson = course.lessons.find(
                  (item) => item.id === day.lesson_id,
                );
                if (!lesson) return null;
                const completed = completedLessonIds.has(lesson.id);
                return (
                  <li key={day.day}>
                    <Link
                      className={completed ? "completed" : undefined}
                      to={`/session/${week.week}/${day.day}`}
                    >
                      <span>День {day.day}</span>
                      <strong>{lesson.title}</strong>
                      <span className="lesson-meta">
                        <small>{day.target_minutes} минут</small>
                        {completed && (
                          <span
                            aria-label="Урок завершён"
                            className="lesson-completed"
                          >
                            ✓ Завершён
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  );
}
