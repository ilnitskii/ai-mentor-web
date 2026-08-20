import { useSync } from "../../app/useSync";
import type { BackendServices } from "../../data/backendServices";
import { useProgressProjection } from "../progress/useProgressProjection";
import { Card } from "../../ui/Card";
import { Icon } from "../../ui/Icon";

export function TodayPage({ services }: { services: BackendServices }) {
  const {
    online,
    syncing,
    pendingCount,
    lastSuccessfulSync,
    errorCode,
    syncNow,
  } = useSync();
  const { projection } = useProgressProjection(services);
  const topics = projection?.topics ?? [];
  const mastery = topics.length
    ? Math.round(
        topics.reduce((sum, topic) => sum + topic.mastery, 0) / topics.length,
      )
    : 0;
  const dueCount =
    projection?.cardStates.filter(
      (card) =>
        new Date(card.dueAt).getTime() <= new Date(projection.asOf).getTime(),
    ).length ?? 0;
  const syncLabel = syncing
    ? "Синхронизация…"
    : online
      ? pendingCount > 0
        ? `Ожидают: ${pendingCount}`
        : "Синхронизировано"
      : `Offline · ожидают: ${pendingCount}`;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Вторник, 18 августа</p>
          <h1>Добрый день</h1>
          <p className="lede">
            Сегодня — один короткий шаг к уверенному анализу данных.
          </p>
        </div>
        <div className="sync-status">
          <div className="sync-pill" aria-label={`Синхронизация: ${syncLabel}`}>
            <span className="status-dot" />
            {syncLabel}
          </div>
          <small>
            {lastSuccessfulSync
              ? `Последняя: ${new Intl.DateTimeFormat("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(lastSuccessfulSync))}`
              : "Успешной синхронизации ещё не было"}
          </small>
          {(pendingCount > 0 || errorCode) && (
            <button
              className="sync-retry"
              disabled={syncing || !online}
              onClick={() => void syncNow()}
              type="button"
            >
              Повторить
            </button>
          )}
        </div>
      </header>

      {errorCode === "EVENT_CONFLICT" && (
        <p className="form-error" role="alert">
          Синхронизация остановлена: EVENT_CONFLICT. Локальные данные сохранены.
        </p>
      )}

      <Card className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow warm">План на сегодня · 25 минут</p>
          <h2>Как устроены данные в таблице</h2>
          <p>
            Разберём логику разделов, закрепим её карточками и решим одну
            задачу.
          </p>
          <a className="primary-action" href="#/session">
            Начать сессию <Icon name="arrow" />
          </a>
        </div>
        <div className="lesson-orbit" aria-hidden="true">
          <span>SQL</span>
          <i className="orbit-one" />
          <i className="orbit-two" />
        </div>
      </Card>

      <section className="metric-grid" aria-label="Учебные показатели">
        <Card>
          <p className="metric-label">Серия</p>
          <strong className="metric-value">
            {projection?.rewards.streak ?? 0} дней
          </strong>
          <p className="metric-note">
            Shields: {projection?.rewards.shields ?? 0} из 2
          </p>
        </Card>
        <Card>
          <p className="metric-label">На повторение</p>
          <strong className="metric-value">{dueCount} карточек</strong>
          <p className="metric-note">По versioned review schedule</p>
        </Card>
        <Card>
          <p className="metric-label">Mastery</p>
          <strong className="metric-value">{mastery}%</strong>
          <p className="metric-note">SQL · базовый уровень</p>
        </Card>
      </section>

      <Card className="next-card">
        <div>
          <p className="eyebrow">После занятия</p>
          <h2>Короткая рефлексия</h2>
          <p>
            Отметьте, что было трудно: это станет evidence для недельного
            отчёта.
          </p>
        </div>
        <span className="time-chip">2 мин</span>
      </Card>
    </div>
  );
}
