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

/**
 * A simulated coworker. Public fields only — safe to send to the browser so
 * the Slack panel can show names and titles. What the agent *knows* lives in
 * the simulation's server-only agents.json (see SimulationAgent).
 */
export interface AgentPersona {
  id: string;
  name: string;
  title: string;
  company: string;
  role: "manager" | "colleague";
  /** How they write: length, warmth, emoji, how busy they are. */
  tone: string;
  avatarColor: string;
  /** Optional model override for this persona (defaults to a small, cheap model). */
  model?: string;
  /** What they say in offline mode (no API key), so the demo still reads naturally. */
  offlineReply: string;
}

/** A hint the agent may give once it's unlocked (by time spent or questions asked). */
export interface HintLevel {
  level: number;
  description: string;
  unlockAfterMinutes?: number;
  unlockAfterUserMessages?: number;
}

/** Server-only: what one agent knows and may say in one simulation. */
export interface SimulationAgent {
  personaId: string;
  /** Facts this agent knows. Different agents know different slices of the truth. */
  knowledge: string[];
  hintLevels: HintLevel[];
  mustNot: string[];
}

/** When a proactive message should fire. Evaluated against the run's event log. */
export type TriggerCondition =
  | { type: "run_started" }
  | { type: "event"; eventType: string }
  | { type: "query_count"; atLeast: number }
  | { type: "query_matches"; pattern: string; atLeast: number }
  | { type: "minutes_elapsed"; atLeast: number }
  | { type: "idle"; minutes: number };

/**
 * A proactive message. Either fixed `text` (free, instant, predictable) or a
 * `prompt` telling the agent what to write (an AI call that sees the activity
 * log). When both are set, `text` is the offline-mode fallback for `prompt`.
 */
export interface AgentTrigger {
  id: string;
  personaId: string;
  when: TriggerCondition;
  text?: string;
  prompt?: string;
  /** Don't fire before the run has been going this long (avoids pile-ups at the start). */
  notBeforeMinutes?: number;
}

/**
 * Deterministic backstop against an agent giving the answer away: if a reply
 * matches `pattern` and the user hasn't raised the topic themselves
 * (`unlessUserSaid`), the reply is replaced with `replacement`.
 */
export interface LeakGuard {
  personaId: string;
  pattern: string;
  unlessUserSaid?: string;
  replacement: string;
}

export interface AgentsConfig {
  agents: SimulationAgent[];
  triggers: AgentTrigger[];
  leakGuards: LeakGuard[];
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
