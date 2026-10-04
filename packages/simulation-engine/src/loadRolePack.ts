import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  AgentPersona,
  AgentsConfig,
  CaseStudyProblem,
  CodingProblem,
  Problem,
  Rubric,
} from "@casebench/domain";

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

interface ProblemLocation {
  problem: Problem;
  /** Folder holding simulation.json / problem.json and its data. */
  dir: string;
  /** Company folder (holds personas/). */
  companyDir: string;
}

/**
 * Lists every problem across every role/company under content/role-packs.
 * Server-only — the truth model lives in memory here but callers MUST use
 * toClientSafe() before this data crosses into any API response or page
 * props. The truth-model leak test (loadRolePack.test.ts) checks this.
 */
export async function listAllProblems(): Promise<Problem[]> {
  return (await locateAllProblems()).map((l) => l.problem);
}

async function locateAllProblems(): Promise<ProblemLocation[]> {
  const found: ProblemLocation[] = [];
  const contentRoot = resolveContentRoot();
  const roles = await readdir(contentRoot, { withFileTypes: true });

  for (const roleDir of roles.filter((d) => d.isDirectory())) {
    const companiesRoot = path.join(contentRoot, roleDir.name, "companies");
    for (const company of await safeReaddir(companiesRoot)) {
      const companyDir = path.join(companiesRoot, company);
      for (const [sub, file] of [["simulations", "simulation.json"], ["problems", "problem.json"]]) {
        const root = path.join(companyDir, sub);
        for (const slug of await safeReaddir(root)) {
          const dir = path.join(root, slug);
          const problem = await readJsonIfExists<Problem>(path.join(dir, file));
          if (problem) found.push({ problem, dir, companyDir });
        }
      }
    }
  }
  return found;
}

/**
 * Everything the server needs to run one problem: the full problem (with
 * truth model), its coworkers, what they know, the rubric, and the measured
 * facts. Server-only. Only `personas` (public fields) may go to the browser.
 */
export interface ProblemBundle {
  problem: Problem;
  personas: AgentPersona[];
  agents: AgentsConfig;
  rubric: Rubric | null;
  analysis: unknown;
  dir: string;
}

export async function loadProblemBundle(slug: string): Promise<ProblemBundle | null> {
  const loc = (await locateAllProblems()).find((l) => l.problem.slug === slug);
  if (!loc) return null;

  const personaDir = path.join(loc.companyDir, "personas");
  const personas: AgentPersona[] = [];
  for (const f of (await safeReaddirFiles(personaDir)).filter((f) => f.endsWith(".json")).sort()) {
    const p = await readJsonIfExists<AgentPersona>(path.join(personaDir, f));
    if (p) personas.push(p);
  }

  return {
    problem: loc.problem,
    personas,
    agents: (await readJsonIfExists<AgentsConfig>(path.join(loc.dir, "agents.json"))) ?? {
      agents: [],
      triggers: [],
      leakGuards: [],
    },
    rubric: await readJsonIfExists<Rubric>(path.join(loc.dir, "rubric.json")),
    analysis: await readJsonIfExists<unknown>(path.join(loc.dir, "analysis.json")),
    dir: loc.dir,
  };
}

/** Public persona fields for the Slack panel. */
export type PublicPersona = Pick<AgentPersona, "id" | "name" | "title" | "role" | "avatarColor">;

export function toPublicPersona(p: AgentPersona): PublicPersona {
  return { id: p.id, name: p.name, title: p.title, role: p.role, avatarColor: p.avatarColor };
}

/**
 * Reads one of a case study's data files. Only files listed in the problem's
 * dataFiles are servable — so analysis.json, agents.json, rubric.json, and
 * any path tricks ("../") can never be requested.
 */
export async function readDataFile(bundle: ProblemBundle, fileName: string): Promise<string | null> {
  if (bundle.problem.type !== "case-study") return null;
  const allowed = bundle.problem.dataFiles.find((f) => path.basename(f) === fileName);
  if (!allowed) return null;
  return readFile(path.join(bundle.dir, allowed), "utf-8");
}

async function safeReaddirFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
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
