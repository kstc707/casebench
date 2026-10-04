/**
 * Core content entities. These mirror the JSON files under content/role-packs/
 * exactly — the file IS the data, these types just describe its shape.
 */

export type Role = "data-analyst" | "data-scientist" | "software-engineer";

export type ProblemType = "case-study" | "coding";

export interface Concept {
  name: string;
  blurb: string;
}

export interface ManagerPersona {
  name: string;
  title: string;
  company: string;
  tone: string;
  /** What the manager is allowed to reveal, and under what conditions. */
  hintPolicy: {
    maxHintLevel: number;
    levels: Array<{ level: number; description: string }>;
  };
  /** Things the manager must never do, regardless of how it's asked. */
  prohibitedBehaviors: string[];
}

export interface CaseStudyProblem {
  type: "case-study";
  slug: string;
  role: Role;
  company: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  estimatedMinutes: number;
  concepts: Concept[];
  brief: string;
  resources: Array<{ title: string; content: string }>;
  dataFiles: string[]; // paths relative to this problem's data/ dir
  /**
   * The ground truth. NEVER serialize this to any client-facing payload.
   * Only the evaluator (server-side, with the submission) should ever see it.
   */
  truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER: unknown;
}

export interface CodingProblem {
  type: "coding";
  slug: string;
  role: Role;
  company: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  estimatedMinutes: number;
  concepts: Concept[];
  assignmentBrief: string;
  functionSignature: string;
  constraints: string[];
  examples: Array<{ input: unknown; output: unknown; explanation?: string }>;
  starterCode: string;
}

export type Problem = CaseStudyProblem | CodingProblem;

export interface RubricCriterion {
  key: string;
  label: string;
  description: string;
  weight: number;
  /** What a weak answer looks like — anchors the evaluator's low end. */
  weak: string;
  /** What a strong answer looks like — anchors the high end. */
  strong: string;
}

export interface Rubric {
  problemSlug: string;
  scale: { min: number; max: number };
  criteria: RubricCriterion[];
}

export interface TestCase {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  hidden: boolean;
}
