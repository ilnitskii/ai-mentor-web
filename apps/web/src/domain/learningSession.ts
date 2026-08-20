import type { AnswerCheckResult } from "./answerChecker";

export type CardRating = "again" | "hard" | "good" | "easy";

export interface LearningSessionState {
  stage: "lesson" | "cards" | "task_picker" | "task" | "summary";
  cardIndex: number;
  cardRatings: CardRating[];
  selectedTaskId: string | null;
  attempts: number;
  hintsUsed: number;
  taskResult: AnswerCheckResult | null;
}

export type LearningSessionAction =
  | { type: "restore"; state: LearningSessionState }
  | { type: "lesson_completed" }
  | { type: "card_reviewed"; rating: CardRating; cardCount: number }
  | { type: "task_selected"; taskId: string }
  | { type: "hint_used" }
  | { type: "task_submitted"; result: AnswerCheckResult }
  | { type: "restart" };

export const initialLearningSession: LearningSessionState = {
  stage: "lesson",
  cardIndex: 0,
  cardRatings: [],
  selectedTaskId: null,
  attempts: 0,
  hintsUsed: 0,
  taskResult: null,
};

export function learningSessionReducer(
  state: LearningSessionState,
  action: LearningSessionAction,
): LearningSessionState {
  switch (action.type) {
    case "restore":
      return action.state;
    case "lesson_completed":
      if (state.stage !== "lesson") return state;
      return { ...state, stage: "cards" };
    case "card_reviewed": {
      if (state.stage !== "cards") return state;
      const ratings = [...state.cardRatings, action.rating];
      const lastCard = state.cardIndex + 1 >= action.cardCount;
      return {
        ...state,
        stage: lastCard ? "task_picker" : "cards",
        cardIndex: lastCard ? state.cardIndex : state.cardIndex + 1,
        cardRatings: ratings,
      };
    }
    case "task_selected":
      if (state.stage !== "task_picker") return state;
      return { ...state, stage: "task", selectedTaskId: action.taskId };
    case "hint_used":
      if (state.stage !== "task") return state;
      return { ...state, hintsUsed: state.hintsUsed + 1 };
    case "task_submitted":
      if (state.stage !== "task") return state;
      return {
        ...state,
        stage: "summary",
        attempts: state.attempts + 1,
        taskResult: action.result,
      };
    case "restart":
      return initialLearningSession;
  }
}

export function isLearningSessionState(
  value: unknown,
): value is LearningSessionState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<LearningSessionState>;
  return (
    ["lesson", "cards", "task_picker", "task", "summary"].includes(
      state.stage ?? "",
    ) &&
    typeof state.cardIndex === "number" &&
    Array.isArray(state.cardRatings) &&
    state.cardRatings.every((rating) =>
      ["again", "hard", "good", "easy"].includes(rating),
    ) &&
    (state.selectedTaskId === null ||
      typeof state.selectedTaskId === "string") &&
    typeof state.attempts === "number" &&
    typeof state.hintsUsed === "number" &&
    (state.taskResult === null || typeof state.taskResult === "object")
  );
}
