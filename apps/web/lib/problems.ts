import "server-only";
import {
  bundleFromScenario,
  listAllProblems,
  loadProblemBundle,
  toClientSafe,
  toPublicPersona,
  validateScenario,
  type ClientSafeProblem,
  type ProblemBundle,
  type PublicPersona,
} from "@casebench/simulation-engine";
import { getPool, getScenarioBySlug, listListedScenarios } from "./db";

/**
 * The only door to problem content. Two sources:
 *  - official scenarios: files in content/role-packs (curated, in git);
 *  - Studio scenarios: authored in the app, stored in Postgres, slug "s-…".
 * Pages and API responses get client-safe views (truth stripped); the full
 * bundle (truth, agent knowledge, rubric) stays on the server.
 */

export const STUDIO_SLUG_PREFIX = "s-";

export interface CatalogEntry {
  problem: ClientSafeProblem;
  source: "official" | "community";
  authorName?: string | null;
  /** When it was published (community) — official ones count as oldest. */
  createdAt?: string;
}

export async function getCatalog(): Promise<CatalogEntry[]> {
  const official: CatalogEntry[] = (await listAllProblems()).map((p) => ({ problem: toClientSafe(p), source: "official" }));
  if (process.env.CASEBENCH_COMMUNITY === "off" || !process.env.DATABASE_URL) return official;
  const community: CatalogEntry[] = [];
  for (const s of await listListedScenarios(getPool())) {
    const v = validateScenario(s.bundle);
    if (v.ok) community.push({ problem: toClientSafe(v.bundle.problem), source: "community", authorName: s.authorName, createdAt: s.createdAt });
  }
  return [...official, ...community];
}

export async function getProblemBySlug(slug: string): Promise<ClientSafeProblem | null> {
  const bundle = await getBundle(slug);
  return bundle ? toClientSafe(bundle.problem) : null;
}

/** File content doesn't change while the server runs, so load each file bundle once. */
const fileBundles = new Map<string, Promise<ProblemBundle | null>>();

export async function getBundle(slug: string): Promise<ProblemBundle | null> {
  if (slug.startsWith(STUDIO_SLUG_PREFIX)) {
    // Studio scenarios can be edited at any time — always read the latest.
    const stored = await getScenarioBySlug(getPool(), slug);
    if (!stored) return null;
    const v = validateScenario(stored.bundle);
    return v.ok ? bundleFromScenario(v.bundle) : null;
  }
  if (!fileBundles.has(slug)) {
    const loading = loadProblemBundle(slug);
    fileBundles.set(slug, loading);
    // Don't remember misses, or requests for random slugs would grow this map forever.
    void loading.then((b) => b ?? fileBundles.delete(slug), () => fileBundles.delete(slug));
  }
  return fileBundles.get(slug)!;
}

export async function getPublicPersonas(slug: string): Promise<PublicPersona[]> {
  const bundle = await getBundle(slug);
  return bundle ? bundle.personas.map(toPublicPersona) : [];
}

/** Rubric criterion labels (not the rubric's anchors) for the feedback view. */
export async function getRubricLabels(slug: string): Promise<Record<string, string>> {
  const bundle = await getBundle(slug);
  return Object.fromEntries((bundle?.rubric?.criteria ?? []).map((c) => [c.key, c.label]));
}
