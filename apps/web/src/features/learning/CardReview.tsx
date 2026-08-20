import { useState } from "react";

import type { LearningCard } from "../../content/types";
import type { CardRating } from "../../domain/learningSession";
import { Card } from "../../ui/Card";

interface CardReviewProps {
  card: LearningCard;
  current: number;
  total: number;
  busy: boolean;
  onReviewed(rating: CardRating, correct: boolean | null): Promise<void>;
}

const ratings: Array<{ value: CardRating; label: string }> = [
  { value: "again", label: "Не помню" },
  { value: "hard", label: "Трудно" },
  { value: "good", label: "Хорошо" },
  { value: "easy", label: "Легко" },
];

export function CardReview({
  card,
  current,
  total,
  busy,
  onReviewed,
}: CardReviewProps) {
  const [revealed, setRevealed] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const hasChoices = card.choices.length > 0;
  const correct =
    selectedChoice === null || card.correct_choice_index === null
      ? null
      : selectedChoice === card.correct_choice_index;

  return (
    <Card className="session-card flashcard">
      <p className="eyebrow">
        Карточка {current} из {total}
      </p>
      <h1>{card.prompt}</h1>

      {hasChoices && !revealed && (
        <div className="answer-options">
          {card.choices.map((choice, index) => (
            <button
              className={
                selectedChoice === index ? "option selected" : "option"
              }
              key={choice}
              onClick={() => setSelectedChoice(index)}
              type="button"
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {!revealed ? (
        <button
          className="primary-button"
          disabled={hasChoices && selectedChoice === null}
          onClick={() => setRevealed(true)}
          type="button"
        >
          Показать ответ
        </button>
      ) : (
        <div className="answer-reveal" aria-live="polite">
          <p className="eyebrow">
            {correct === null ? "Ответ" : correct ? "Верно" : "Нужно повторить"}
          </p>
          <h2>{card.answer}</h2>
          <p>{card.explanation}</p>
          <div className="rating-grid" aria-label="Оцените воспроизведение">
            {ratings.map((rating) => (
              <button
                className="secondary-button"
                disabled={busy}
                key={rating.value}
                onClick={() => onReviewed(rating.value, correct)}
                type="button"
              >
                {rating.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
