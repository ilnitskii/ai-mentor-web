import { useEffect, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../app/useAuth";
import { useSync } from "../../app/useSync";
import {
  foundationCards,
  foundationLesson,
  foundationTasks,
} from "../../content/course";
import type { LearningTask } from "../../content/types";
import type { BackendServices } from "../../data/backendServices";
import type { Json } from "../../data/database.types";
import type { PendingReviewInput } from "../../data/mentorDatabase";
import { checkAnswer } from "../../domain/answerChecker";
import {
  initialLearningSession,
  isLearningSessionState,
  learningSessionReducer,
  type CardRating,
  type LearningSessionAction,
  type LearningSessionState,
} from "../../domain/learningSession";
import { createProgressEvent } from "../../domain/progressEvent";
import { Card } from "../../ui/Card";
import { CardReview } from "./CardReview";
import { LessonRenderer } from "./LessonRenderer";
import { TaskRunner } from "./TaskRunner";

interface LearningSessionPageProps {
  services: BackendServices;
}

const asJson = (state: LearningSessionState) => state as unknown as Json;

export function LearningSessionPage({ services }: LearningSessionPageProps) {
  const { user } = useAuth();
  const { refreshPending, syncNow } = useSync();
  const [state, dispatch] = useReducer(
    learningSessionReducer,
    initialLearningSession,
  );
  const [lessonAnswer, setLessonAnswer] = useState("");
  const [lessonFeedback, setLessonFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const pendingAttempt = useRef<{
    attemptId: string;
    reviewId: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) return;
    void services.offline
      .loadSession(user.id)
      .then((saved) => {
        if (active && isLearningSessionState(saved)) {
          dispatch({ type: "restore", state: saved });
        }
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [services.offline, user]);

  if (!user) return null;

  if (restoring)
    return (
      <main className="app-gate" aria-live="polite">
        Восстанавливаем сессию…
      </main>
    );

  async function commitAction(
    action: LearningSessionAction,
    itemId: string,
    eventType: "lesson_completed" | "card_reviewed" | "task_submitted",
    payload: Record<string, string | number | boolean | null>,
    pendingReview?: PendingReviewInput,
  ) {
    const nextState = learningSessionReducer(state, action);
    await services.offline.commitProgress(
      user!.id,
      createProgressEvent(itemId, eventType, payload),
      asJson(nextState),
      pendingReview,
    );
    dispatch(action);
    await refreshPending();
    void syncNow();
  }

  async function saveLocalAction(action: LearningSessionAction) {
    const nextState = learningSessionReducer(state, action);
    await services.offline.saveSession(user!.id, asJson(nextState));
    dispatch(action);
  }

  async function completeLesson() {
    if (!foundationLesson.check) return;
    const result = checkAnswer(foundationLesson.check.rule, lessonAnswer);
    if (!result.correct) {
      setLessonFeedback(
        "Вернитесь к понятию зерна таблицы и попробуйте ещё раз.",
      );
      return;
    }
    setBusy(true);
    setErrorCode(null);
    try {
      await commitAction(
        { type: "lesson_completed" },
        foundationLesson.id,
        "lesson_completed",
        { correct: true },
      );
    } catch {
      setErrorCode("LOCAL_STORAGE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function reviewCard(rating: CardRating, correct: boolean | null) {
    const card = foundationCards[state.cardIndex];
    setBusy(true);
    setErrorCode(null);
    try {
      await commitAction(
        {
          type: "card_reviewed",
          rating,
          cardCount: foundationCards.length,
        },
        card.id,
        "card_reviewed",
        { rating, correct },
      );
    } catch {
      setErrorCode("LOCAL_STORAGE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function submitTask(task: LearningTask, answer: string) {
    const result = checkAnswer(task.checker, answer);
    setBusy(true);
    setErrorCode(null);
    try {
      if (result.status === "pending_review") {
        pendingAttempt.current ??= {
          attemptId: crypto.randomUUID(),
          reviewId: crypto.randomUUID(),
        };
      }

      const pendingReview = pendingAttempt.current
        ? {
            review_id: pendingAttempt.current.reviewId,
            attempt_id: pendingAttempt.current.attemptId,
            task_id: task.id,
            answer,
          }
        : undefined;
      await commitAction(
        { type: "task_submitted", result },
        task.id,
        "task_submitted",
        {
          attempt: state.attempts + 1,
          answer_type: task.answer_type,
          hints_used: state.hintsUsed,
          correct: result.correct,
          review_status: result.status,
        },
        pendingReview,
      );
    } catch {
      setErrorCode("LOCAL_STORAGE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const selectedTask = foundationTasks.find(
    (task) => task.id === state.selectedTaskId,
  );

  return (
    <div className="page session-page">
      <div className="session-progress" aria-label="Этап учебной сессии">
        <span className={state.stage === "lesson" ? "active" : "done"}>
          Урок
        </span>
        <span
          className={
            state.stage === "cards"
              ? "active"
              : state.stage === "lesson"
                ? ""
                : "done"
          }
        >
          Карточки
        </span>
        <span
          className={
            state.stage === "task" || state.stage === "task_picker"
              ? "active"
              : state.stage === "summary"
                ? "done"
                : ""
          }
        >
          Задача
        </span>
        <span className={state.stage === "summary" ? "active" : ""}>Итог</span>
      </div>

      {errorCode && (
        <p className="form-error" role="alert">
          Не удалось сохранить действие на устройстве. Освободите место и
          повторите.
        </p>
      )}

      {state.stage === "lesson" && (
        <Card className="session-card lesson-card">
          <p className="eyebrow">
            Микроурок · {foundationLesson.estimated_minutes} минут
          </p>
          <LessonRenderer body={foundationLesson.body} />
          {foundationLesson.check && (
            <div className="lesson-check">
              <h2>{foundationLesson.check.question}</h2>
              <label>
                Ваш ответ
                <input
                  onChange={(event) => setLessonAnswer(event.target.value)}
                  type="text"
                  value={lessonAnswer}
                />
              </label>
              {lessonFeedback && <p role="alert">{lessonFeedback}</p>}
              <button
                className="primary-button"
                disabled={busy || !lessonAnswer.trim()}
                onClick={completeLesson}
                type="button"
              >
                Проверить и продолжить
              </button>
            </div>
          )}
        </Card>
      )}

      {state.stage === "cards" && (
        <CardReview
          busy={busy}
          card={foundationCards[state.cardIndex]}
          current={state.cardIndex + 1}
          key={foundationCards[state.cardIndex].id}
          onReviewed={reviewCard}
          total={foundationCards.length}
        />
      )}

      {state.stage === "task_picker" && (
        <Card className="session-card">
          <p className="eyebrow">Выберите одну задачу</p>
          <h1>Закрепите материал</h1>
          <div className="task-picker">
            {foundationTasks.map((task) => (
              <button
                className="option"
                key={task.id}
                onClick={() =>
                  void saveLocalAction({
                    type: "task_selected",
                    taskId: task.id,
                  })
                }
                type="button"
              >
                <strong>{task.answer_type}</strong>
                <span>{task.prompt}</span>
                <small>{task.estimated_minutes} мин</small>
              </button>
            ))}
          </div>
        </Card>
      )}

      {state.stage === "task" && selectedTask && (
        <TaskRunner
          busy={busy}
          key={selectedTask.id}
          onHint={() => void saveLocalAction({ type: "hint_used" })}
          onSubmit={(answer) => submitTask(selectedTask, answer)}
          task={selectedTask}
        />
      )}

      {state.stage === "summary" && (
        <Card className="session-card summary-card">
          <p className="eyebrow">Сессия завершена</p>
          <h1>
            {state.taskResult?.status === "pending_review"
              ? "Ответ отправлен на проверку"
              : state.taskResult?.correct
                ? "Отличная работа"
                : "Есть материал для повторения"}
          </h1>
          <p>
            Урок завершён, повторено карточек: {state.cardRatings.length},
            подсказок использовано: {state.hintsUsed}.
          </p>
          <Link className="primary-button button-link" to="/progress">
            Посмотреть прогресс
          </Link>
        </Card>
      )}
    </div>
  );
}
