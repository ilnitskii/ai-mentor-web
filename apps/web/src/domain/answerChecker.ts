import type { AnswerCheckRule } from "../content/types";

export interface AnswerCheckResult {
  status: "correct" | "incorrect" | "pending_review";
  correct: boolean | null;
}

export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "");
}

export function checkAnswer(
  rule: AnswerCheckRule,
  answer: string,
): AnswerCheckResult {
  if (rule.mode === "pending_review")
    return { status: "pending_review", correct: null };

  const matches =
    rule.mode === "exact"
      ? rule.expected_answers.some((expected) => answer.trim() === expected)
      : rule.expected_answers.some(
          (expected) => normalizeAnswer(answer) === normalizeAnswer(expected),
        );

  return {
    status: matches ? "correct" : "incorrect",
    correct: matches,
  };
}
