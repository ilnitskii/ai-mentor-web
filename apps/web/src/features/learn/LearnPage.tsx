import { Link } from "react-router-dom";

import { useCourse } from "../../content/useCourse";
import type { BackendServices } from "../../data/backendServices";
import { Card } from "../../ui/Card";

export function LearnPage({ services }: { services: BackendServices }) {
  const course = useCourse(services);

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
              </div>
            </div>
            <ol className="course-lessons">
              {week.days.map((day) => {
                const lesson = course.lessons.find(
                  (item) => item.id === day.lesson_id,
                );
                if (!lesson) return null;
                return (
                  <li key={day.day}>
                    <Link to={`/session/${week.week}/${day.day}`}>
                      <span>День {day.day}</span>
                      <strong>{lesson.title}</strong>
                      <small>{day.target_minutes} минут</small>
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
