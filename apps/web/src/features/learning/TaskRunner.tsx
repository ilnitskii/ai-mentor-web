import { type FormEvent, useState } from "react";

import type { LearningTask } from "../../content/types";
import { Card } from "../../ui/Card";

interface TaskRunnerProps {
  task: LearningTask;
  busy: boolean;
  onHint(): void;
  onSubmit(answer: string): Promise<void>;
}

export function TaskRunner({ task, busy, onHint, onSubmit }: TaskRunnerProps) {
  const [answer, setAnswer] = useState("");
  const [visibleHints, setVisibleHints] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(answer);
  }

  function showHint() {
    if (visibleHints >= task.hints.length) return;
    setVisibleHints((value) => value + 1);
    onHint();
  }

  return (
    <Card className="session-card task-card">
      <p className="eyebrow">
        Задача · {task.estimated_minutes} мин · {task.answer_type}
      </p>
      <h1>{task.prompt}</h1>
      <form className="task-form" onSubmit={submit}>
        {task.answer_type === "choice" ? (
          <div className="answer-options">
            {task.options.map((option) => (
              <label className="option" key={option}>
                <input
                  checked={answer === option}
                  name="task-answer"
                  onChange={() => setAnswer(option)}
                  type="radio"
                  value={option}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        ) : task.answer_type === "text" ||
          task.answer_type === "code_as_text" ? (
          <textarea
            aria-label="Ответ"
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={
              task.answer_type === "code_as_text"
                ? "Введите код как текст — он не будет выполнен"
                : "Введите ответ"
            }
            required
            rows={task.answer_type === "code_as_text" ? 7 : 5}
            value={answer}
          />
        ) : (
          <input
            aria-label="Ответ"
            inputMode="decimal"
            onChange={(event) => setAnswer(event.target.value)}
            required
            type="text"
            value={answer}
          />
        )}

        {visibleHints > 0 && (
          <div className="hint-list" aria-live="polite">
            {task.hints.slice(0, visibleHints).map((hint) => (
              <p key={hint}>{hint}</p>
            ))}
          </div>
        )}

        <div className="task-actions">
          {task.hints.length > 0 && visibleHints < task.hints.length && (
            <button
              className="secondary-button"
              onClick={showHint}
              type="button"
            >
              Подсказка
            </button>
          )}
          <button
            className="primary-button"
            disabled={busy || !answer.trim()}
            type="submit"
          >
            {busy ? "Сохраняем…" : "Ответить"}
          </button>
        </div>
      </form>
    </Card>
  );
}
