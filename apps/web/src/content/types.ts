export type CheckerMode = "exact" | "normalized" | "pending_review";

export interface AnswerCheckRule {
  mode: CheckerMode;
  expected_answers: string[];
}

export interface Topic {
  id: string;
  title: string;
  prerequisites: string[];
  status: "active" | "archived";
}

export interface Lesson {
  id: string;
  topic_id: string;
  title: string;
  body: string;
  estimated_minutes: number;
  check?: { question: string; options: string[]; rule: AnswerCheckRule };
  status: "active" | "archived";
}

export type CardType =
  | "question_answer"
  | "multiple_choice"
  | "true_false"
  | "sql_output_prediction";

export interface LearningCard {
  id: string;
  topic_id: string;
  prompt: string;
  answer: string;
  type: CardType;
  choices: string[];
  correct_choice_index: number | null;
  explanation: string;
  source_lesson_id: string | null;
  difficulty: "easy" | "medium" | "hard";
  status: "active" | "archived";
}

export type TaskAnswerType = "choice" | "number" | "text" | "code_as_text";

export interface LearningTask {
  id: string;
  topic_id: string;
  prompt: string;
  answer_type: TaskAnswerType;
  options: string[];
  checker: AnswerCheckRule;
  difficulty: "easy" | "medium" | "hard";
  estimated_minutes: number;
  hints: string[];
  reference_solution: string;
  rubric: Array<{ criterion: string; points: number }>;
  status: "active" | "archived";
}

export interface Course {
  schema_version: 1;
  profile_id: string;
  track_id: string;
  release_version: number;
  title: string;
  start_week: number;
  end_week: number;
  topics: Topic[];
  lessons: Lesson[];
  cards: LearningCard[];
  tasks: LearningTask[];
  weeks: Array<{
    week: number;
    title: string;
    outcome: string;
    days: Array<{
      day: number;
      lesson_id: string;
      card_ids: string[];
      task_ids: string[];
      target_minutes: number;
    }>;
    project_task_id: string;
  }>;
  daily_plan: {
    date: string;
    target_minutes: number;
    rationale: string;
    items: Array<{ item_id: string; type: "lesson" | "card" | "task" }>;
  };
}
