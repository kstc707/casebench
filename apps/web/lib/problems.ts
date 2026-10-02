import "server-only";
import { listAllProblems, toClientSafe, type ClientSafeProblem } from "@casebench/simulation-engine";

/**
 * The only way the app should ever read problem content. Always returns
 * the client-safe view (truth model stripped) — see
 * packages/simulation-engine/src/loadRolePack.ts for where that happens.
 */
export async function getProblemsForDashboard(): Promise<ClientSafeProblem[]> {
  const all = await listAllProblems();
  return all.map(toClientSafe);
}

export async function getProblemBySlug(slug: string): Promise<ClientSafeProblem | null> {
  const all = await getProblemsForDashboard();
  return all.find((p) => p.slug === slug) ?? null;
}
