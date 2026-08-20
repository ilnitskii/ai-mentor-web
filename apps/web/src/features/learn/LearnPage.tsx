import { Card } from "../../ui/Card";
import { Link } from "react-router-dom";

const topics = [
  {
    title: "Таблицы и качество данных",
    detail: "4 урока · 62% mastery",
    tone: "green",
  },
  {
    title: "SQL: оконные функции",
    detail: "2 урока · 31% mastery",
    tone: "orange",
  },
  { title: "Метрики продукта", detail: "Откроется после SQL", tone: "muted" },
];

export function LearnPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Карта навыков</p>
          <h1>Учиться</h1>
          <p className="lede">
            Темы открываются по мере появления проверяемых доказательств.
          </p>
        </div>
      </header>
      <div className="topic-list">
        {topics.map((topic, index) => (
          <Card className="topic-card" key={topic.title}>
            <span className={`topic-number ${topic.tone}`}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2>{topic.title}</h2>
              <p>{topic.detail}</p>
            </div>
          </Card>
        ))}
      </div>
      <Link className="primary-button button-link learn-start" to="/session">
        Начать сегодняшнюю сессию
      </Link>
    </div>
  );
}
