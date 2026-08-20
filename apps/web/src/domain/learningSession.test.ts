import {
  initialLearningSession,
  learningSessionReducer,
} from "./learningSession";

describe("learningSessionReducer", () => {
  it("moves through lesson, cards, one task and summary", () => {
    let state = learningSessionReducer(initialLearningSession, {
      type: "lesson_completed",
    });
    expect(state.stage).toBe("cards");

    state = learningSessionReducer(state, {
      type: "card_reviewed",
      rating: "good",
      cardCount: 2,
    });
    expect(state.cardIndex).toBe(1);
    state = learningSessionReducer(state, {
      type: "card_reviewed",
      rating: "hard",
      cardCount: 2,
    });
    expect(state.stage).toBe("task_picker");

    state = learningSessionReducer(state, {
      type: "task_selected",
      taskId: "task-1",
    });
    state = learningSessionReducer(state, { type: "hint_used" });
    state = learningSessionReducer(state, {
      type: "task_submitted",
      result: { status: "correct", correct: true },
    });

    expect(state).toMatchObject({
      stage: "summary",
      attempts: 1,
      hintsUsed: 1,
      cardRatings: ["good", "hard"],
    });
  });

  it("ignores duplicate completion actions outside their stage", () => {
    const cards = learningSessionReducer(initialLearningSession, {
      type: "lesson_completed",
    });
    expect(learningSessionReducer(cards, { type: "lesson_completed" })).toBe(
      cards,
    );
  });
});
