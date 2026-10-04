import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { CaseStudyProblem, CodingProblem, Problem } from "@casebench/domain";

/**
 * Where content/role-packs lives. CASEBENCH_CONTENT_ROOT wins if set;
 * otherwise look relative to the working directory, which is the repo root
 * for tests/scripts and apps/web for `next dev` / `next start` / Vercel.
 */
function resolveContentRoot(): string {
  if (process.env.CASEBENCH_CONTENT_ROOT) return process.env.CASEBENCH_CONTENT_ROOT;
  const candidates = [
    path.resolve(process.cwd(), "content/role-packs"),
    path.resolve(process.cwd(), "../../content/role-packs"),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[candidates.length - 1];
}

/**
 * The client-safe view of a case study — everything except the truth model.
 * This type exists specifically so "did I forget to strip the truth model"
 * is a type error, not just a code-review concern.
 */
export type ClientSafeCaseStudy = Omit<
  CaseStudyProblem,
  "truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER"
>;

export type ClientSafeProblem = ClientSafeCaseStudy | CodingProblem;

export function toClientSafe(problem: Problem): ClientSafeProblem {
  if (problem.type === "case-study") {
    const { truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER, ...safe } = problem;
    return safe;
  }
  return problem;
}

/**
 * Lists every problem across every role/company under content/role-packs.
 * Server-only — the truth model lives in memory here but callers MUST use
 * toClientSafe() before this data crosses into any API response or page
 * props. (See docs/architecture.md: this should also be covered by an
 * automated test that serializes a listing response and asserts the truth
 * model key is absent, the way it was verified in the earlier prototype.)
 */
export async function listAllProblems(): Promise<Problem[]> {
  const problems: Problem[] = [];
  const contentRoot = resolveContentRoot();
  const roles = await readdir(contentRoot, { withFileTypes: true });

  for (const roleDir of roles.filter((d) => d.isDirectory())) {
    const companiesRoot = path.join(contentRoot, roleDir.name, "companies");
    const companies = await safeReaddir(companiesRoot);

    for (const companyDir of companies) {
      await loadCaseStudies(companiesRoot, companyDir, problems);
      await loadCodingProblems(companiesRoot, companyDir, problems);
    }
  }

  return problems;
}

async function loadCaseStudies(companiesRoot: string, company: string, out: Problem[]) {
  const simsRoot = path.join(companiesRoot, company, "simulations");
  const slugs = await safeReaddir(simsRoot);
  for (const slug of slugs) {
    const file = path.join(simsRoot, slug, "simulation.json");
    const problem = await readJsonIfExists<CaseStudyProblem>(file);
    if (problem) out.push(problem);
  }
}

async function loadCodingProblems(companiesRoot: string, company: string, out: Problem[]) {
  const problemsRoot = path.join(companiesRoot, company, "problems");
  const slugs = await safeReaddir(problemsRoot);
  for (const slug of slugs) {
    const file = path.join(problemsRoot, slug, "problem.json");
    const problem = await readJsonIfExists<CodingProblem>(file);
    if (problem) out.push(problem);
  }
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function readJsonIfExists<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
