import { checkAnswer, normalizeAnswer } from "./answerChecker";

describe("answer checker", () => {
  it("supports exact and normalized deterministic checks", () => {
    expect(
      checkAnswer(
        { mode: "exact", expected_answers: ["Одна продажа"] },
        "Одна продажа",
      ),
    ).toEqual({ status: "correct", correct: true });
    expect(
      checkAnswer(
        { mode: "normalized", expected_answers: ["sale_id"] },
        "  SALE_ID. ",
      ),
    ).toEqual({ status: "correct", correct: true });
    expect(normalizeAnswer("  Одну   продажу! ")).toBe("одну продажу");
  });

  it("never assigns a false automatic grade to free answers", () => {
    expect(
      checkAnswer(
        { mode: "pending_review", expected_answers: [] },
        "Свободное объяснение ученика",
      ),
    ).toEqual({ status: "pending_review", correct: null });
  });
});
