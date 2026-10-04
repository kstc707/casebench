import "server-only";
import {
  listAllProblems,
  loadProblemBundle,
  toClientSafe,
  toPublicPersona,
  type ClientSafeProblem,
  type ProblemBundle,
  type PublicPersona,
} from "@casebench/simulation-engine";

/**
 * The only way the app should ever read problem content. Pages and API
 * responses get the client-safe view (truth model stripped); the full bundle
 * (truth, agent knowledge, rubric, measured facts) stays on the server.
 */
export async function getProblemsForDashboard(): Promise<ClientSafeProblem[]> {
  const all = await listAllProblems();
  return all.map(toClientSafe);
}

export async function getProblemBySlug(slug: string): Promise<ClientSafeProblem | null> {
  const all = await getProblemsForDashboard();
  return all.find((p) => p.slug === slug) ?? null;
}

/** Content doesn't change while the server runs, so load each bundle once. */
const bundles = new Map<string, Promise<ProblemBundle | null>>();

export function getBundle(slug: string): Promise<ProblemBundle | null> {
  if (!bundles.has(slug)) {
    const loading = loadProblemBundle(slug);
    bundles.set(slug, loading);
    // Don't remember misses, or requests for random slugs would grow this map forever.
    void loading.then((b) => b ?? bundles.delete(slug), () => bundles.delete(slug));
  }
  return bundles.get(slug)!;
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
