/**
 * Core content entities. These mirror the JSON files under content/role-packs/
 * exactly — the file IS the data, these types just describe its shape.
 */

/**
 * The job a simulation is about. Free text so authors can add new tracks
 * (e.g. "ux-designer"); these are the ones the UI knows how to label.
 */
export type Role = string;
export const KNOWN_ROLES: Record<string, string> = {
  "data-analyst": "Data Analyst",
  "data-scientist": "Data Scientist",
  "ux-designer": "UX Designer",
  "product-manager": "Product Manager",
  "software-engineer": "Software Engineer",
};

/** One section of the write-up the user submits (e.g. "Executive summary"). */
export interface DeliverableSection {
  key: string;
  label: string;
  hint: string;
  rows?: number;
  required?: boolean;
}

/** The write-up shape used when a case doesn't define its own. */
export const DEFAULT_DELIVERABLE: DeliverableSection[] = [
  { key: "executiveSummary", label: "Executive summary", hint: "Two or three sentences leadership can read in ten seconds. Lead with the answer.", rows: 4, required: true },
  { key: "evidence", label: "Evidence", hint: "The numbers behind each claim, and how you got them.", rows: 8 },
  { key: "caveats", label: "Caveats", hint: "What you're unsure about and why.", rows: 3 },
  { key: "recommendation", label: "Recommendation", hint: "What should happen next, and which team owns it.", rows: 4, required: true },
];

/** A submitted write-up: section key → text. */
export type Submission = Record<string, string>;

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
  /** CSVs for the SQL workbench (paths like "data/users.csv"). Empty = no SQL app. */
  dataFiles: string[];
  /** Sections of the write-up. Defaults to DEFAULT_DELIVERABLE. */
  deliverable?: DeliverableSection[];
  /** Display name for the company (defaults to the company slug, title-cased). */
  companyName?: string;
  /** Slack channel name for the project (defaults to the slug). */
  channel?: string;
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
  /**
   * Offline grading only (no AI key): groups of regex alternatives. Each
   * group found in the submission earns points. Ignored by the AI grader.
   */
  offlineKeywords?: string[];
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
