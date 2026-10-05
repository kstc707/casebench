import type { ScenarioBundle } from "./scenarioSchema";

/**
 * Complexity score v1: a transparent heuristic, not a black box.
 *
 * Step 1 — structural (from the simulation itself):
 *   investigation  how much information there is to sift (resources, data tables, rows)
 *   ambiguity      how much is hidden and spread across people (private facts, coworkers, judged dimensions)
 *   technical      whether real tools are needed (SQL over data) and how big the data is
 *   scope          how much must be delivered (write-up sections, rubric criteria)
 *   time           the creator's time estimate
 *
 * Step 2 — observed (once enough people have finished it): the lower the
 * completion rate and average score, the harder it really is. The observed
 * signal gets more weight as completions grow, up to 60%.
 */

export interface DataStats {
  tables: number;
  totalRows: number;
}

export interface SolverStats {
  attempts: number;
  completions: number;
  avgScore: number | null;
  avgMinutes: number | null;
}

export interface Complexity {
  score: number; // 0–10, one decimal
  label: "Beginner" | "Intermediate" | "Advanced" | "Expert";
  dimensions: { investigation: number; ambiguity: number; technical: number; scope: number; time: number };
  /** 0–1: how much of the score comes from real solver results. */
  observedWeight: number;
  expectedMinutes: number;
  /** True when expectedMinutes comes from real solvers rather than the creator's estimate. */
  minutesFromSolvers: boolean;
}

/** 0–10 on a square-root scale (early additions count most): `full` or more → 10. */
const scale = (x: number, full: number) => round(10 * Math.min(1, Math.sqrt(Math.max(0, x) / full)));
const round = (x: number) => Math.round(x * 10) / 10;

type Shape = Pick<ScenarioBundle, "problem" | "personas" | "agents" | "rubric">;

export function structuralDimensions(b: Shape, data: DataStats = { tables: b.problem.dataFiles.length, totalRows: 0 }) {
  const resourceChars = b.problem.resources.reduce((s, r) => s + r.content.length, 0);
  const facts = b.agents.agents.reduce((s, a) => s + a.knowledge.length, 0);
  const informedPeople = b.agents.agents.filter((a) => a.knowledge.length > 0).length;
  const sections = b.problem.deliverable?.length ?? 4;

  const investigation = round(
    0.4 * scale(b.problem.resources.length, 8) + 0.3 * scale(resourceChars, 12_000) + 0.3 * scale(data.totalRows, 50_000)
  );
  const ambiguity = round(
    0.5 * scale(facts, 15) + 0.3 * scale(Math.max(0, informedPeople - 1), 3) + 0.2 * scale(b.rubric.criteria.length, 12)
  );
  // Needing a real tool (SQL) is a step up on its own; size adds the rest. Max 10.
  const technical = data.tables === 0 ? 1 : round(4 + 0.3 * scale(data.tables, 8) + 0.3 * scale(data.totalRows, 50_000));
  const scope = round(0.6 * scale(sections, 10) + 0.4 * scale(b.rubric.criteria.length, 12));
  const time = round(10 * Math.min(1, b.problem.estimatedMinutes / 180));
  return { investigation, ambiguity, technical, scope, time };
}

export function computeComplexity(b: Shape, data?: DataStats, solvers?: SolverStats): Complexity {
  const d = structuralDimensions(b, data);
  const structural = 0.3 * d.investigation + 0.3 * d.ambiguity + 0.2 * d.technical + 0.1 * d.scope + 0.1 * d.time;

  let score = structural;
  let observedWeight = 0;
  let expectedMinutes = b.problem.estimatedMinutes;
  let minutesFromSolvers = false;
  if (solvers && solvers.completions >= 5 && solvers.attempts > 0) {
    const completionRate = solvers.completions / solvers.attempts;
    const avgScore = (solvers.avgScore ?? 50) / 100;
    const observed = 10 * (1 - completionRate * avgScore);
    observedWeight = Math.min(0.6, solvers.completions / 50);
    score = (1 - observedWeight) * structural + observedWeight * observed;
    // Ignore implausibly fast averages (e.g. test runs); a real attempt takes minutes.
    if (solvers.avgMinutes !== null && solvers.avgMinutes >= 3) {
      expectedMinutes = Math.round(solvers.avgMinutes);
      minutesFromSolvers = true;
    }
  }
  score = round(Math.min(10, Math.max(0, score)));
  return {
    score,
    label: score < 3 ? "Beginner" : score < 5 ? "Intermediate" : score < 7 ? "Advanced" : "Expert",
    dimensions: d,
    observedWeight: round(observedWeight),
    expectedMinutes,
    minutesFromSolvers,
  };
}

/** Row count of a CSV without parsing it (header excluded). */
export function csvRows(text: string): number {
  const lines = text.trim().split("\n").length;
  return Math.max(0, lines - 1);
}
