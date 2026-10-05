import "server-only";
import {
  computeComplexity,
  csvRows,
  readDataFile,
  type Complexity,
  type DataStats,
  type ProblemBundle,
  type ScenarioBundle,
} from "@casebench/simulation-engine";
import type { SocialSummary, SolverStatsRow } from "@casebench/database";
import { getPool, socialSummaries, solverStats } from "./db";
import { getBundle } from "./problems";

/**
 * Everything the community layer shows about a simulation: how hard it is,
 * how people did, and how they liked it.
 */
export interface SimulationMeta {
  complexity: Complexity;
  stats: SolverStatsRow;
  social: SocialSummary;
}

const dataStatsCache = new Map<string, DataStats>();

async function dataStats(bundle: ProblemBundle): Promise<DataStats> {
  const p = bundle.problem;
  if (p.type !== "case-study") return { tables: 0, totalRows: 0 };
  const key = `${p.slug}:${bundle.dir ?? "inline"}`;
  // File data never changes at runtime; Studio data can, so only cache files.
  if (bundle.dir && dataStatsCache.has(key)) return dataStatsCache.get(key)!;
  let totalRows = 0;
  for (const f of p.dataFiles) totalRows += csvRows((await readDataFile(bundle, f.replace(/^data\//, ""))) ?? "");
  const stats = { tables: p.dataFiles.length, totalRows };
  if (bundle.dir) dataStatsCache.set(key, stats);
  return stats;
}

const emptyStats = (slug: string): SolverStatsRow => ({
  slug,
  attempts: 0,
  completions: 0,
  solvers: 0,
  avgScore: null,
  avgMinutes: null,
  attemptsLast7Days: 0,
});

/** Meta for many simulations at once (two queries, not two per simulation). */
export async function metaFor(slugs: string[]): Promise<Map<string, SimulationMeta>> {
  const pool = getPool();
  const [stats, social] = await Promise.all([solverStats(pool, slugs), socialSummaries(pool, slugs)]);
  const out = new Map<string, SimulationMeta>();
  for (const slug of slugs) {
    const bundle = await getBundle(slug);
    if (!bundle || bundle.problem.type !== "case-study" || !bundle.rubric) continue;
    const s = stats.get(slug) ?? emptyStats(slug);
    const shape = { problem: bundle.problem, personas: bundle.personas, agents: bundle.agents, rubric: bundle.rubric } as ScenarioBundle;
    out.set(slug, {
      complexity: computeComplexity(shape, await dataStats(bundle), s),
      stats: s,
      social: social.get(slug) ?? { likes: 0, ratingAvg: null, ratingCount: 0 },
    });
  }
  return out;
}
