import { course } from "../../content/course";
import type { BackendServices } from "../../data/backendServices";
import { Card } from "../../ui/Card";
import { useProgressProjection } from "./useProgressProjection";

export function ProgressPage({ services }: { services: BackendServices }) {
  const { projection, loading, errorCode } = useProgressProjection(services);
  const topics = projection?.topics ?? [];
  const overallMastery = topics.length
    ? Math.round(
        topics.reduce((sum, topic) => sum + topic.mastery, 0) / topics.length,
      )
    : 0;
  const graded = topics.reduce((sum, topic) => sum + topic.gradedCount, 0);
  const correct = topics.reduce(
    (sum, topic) => sum + topic.gradedCount * (topic.recentAccuracy ?? 0),
    0,
  );
  const dueCards =
    projection?.cardStates.filter(
      (card) =>
        new Date(card.dueAt).getTime() <= new Date(projection.asOf).getTime(),
    ) ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Только доказательный прогресс</p>
          <h1>Прогресс</h1>
          <p className="lede">
            Mastery отделён от активности: чтение само по себе не означает
            навык.
          </p>
        </div>
      </header>
      {errorCode && (
        <p className="form-error" role="status">
          Показаны доступные локальные события; сервер сейчас недоступен.
        </p>
      )}
      <Card className="progress-card">
        <div
          className="progress-ring"
          aria-label={`${overallMastery} процентов mastery`}
        >
          <span>{loading ? "…" : `${overallMastery}%`}</span>
        </div>
        <div>
          <p className="eyebrow">Общий mastery</p>
          <h2>
            {overallMastery >= 70
              ? "Навык подтверждён практикой"
              : "Собираем независимые доказательства"}
          </h2>
          <p>
            Чтение ограничено уровнем 40%; основной рост дают задачи и карточки
            без раскрывающих подсказок.
          </p>
        </div>
      </Card>
      <section className="metric-grid two-columns">
        <Card>
          <p className="metric-label">Проверяемые ответы</p>
          <strong className="metric-value">{graded}</strong>
          <p className="metric-note">
            {graded ? Math.round((100 * correct) / graded) : 0}% точность
          </p>
        </Card>
        <Card>
          <p className="metric-label">XP за неделю</p>
          <strong className="metric-value">
            {projection?.rewards.totalXp ?? 0}
          </strong>
          <p className="metric-note">Активность, не оценка навыка</p>
        </Card>
      </section>

      <section className="progress-details" aria-label="Mastery по темам">
        {topics.map((topic) => (
          <Card key={topic.topicId}>
            <p className="eyebrow">
              {course.topics.find((item) => item.id === topic.topicId)?.title ??
                topic.topicId}
            </p>
            <strong className="metric-value">{topic.mastery}%</strong>
            <p className="metric-note">
              Evidence: {topic.evidenceCount} · точность:{" "}
              {topic.recentAccuracy === null
                ? "нет проверяемых ответов"
                : `${Math.round(topic.recentAccuracy * 100)}%`}
            </p>
          </Card>
        ))}
      </section>

      <section className="progress-details" aria-label="Очередь повторения">
        <Card>
          <p className="eyebrow">На повторение сейчас</p>
          <strong className="metric-value">{dueCards.length}</strong>
          <p className="metric-note">
            Расписание перестраивается из card_reviewed events.
          </p>
        </Card>
        <Card>
          <p className="eyebrow">Журнал ошибок</p>
          {projection?.recentMistakes.length ? (
            <ul className="mistake-list">
              {projection.recentMistakes.slice(0, 5).map((mistake) => (
                <li key={mistake.eventId}>{mistake.itemId}</li>
              ))}
            </ul>
          ) : (
            <p className="metric-note">Ошибок пока нет.</p>
          )}
        </Card>
      </section>
    </div>
  );
}
