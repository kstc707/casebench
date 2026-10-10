import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PRACTICE_RUN_PREFIX, type PracticeTask, type PracticeTaskSummary } from "./types";

/**
 * Practice tasks live in content/practice/<project>/<slug>.json (exported by
 * research/practice-mode-spike/export_tasks.py). They don't change while the
 * server runs, so they're read once.
 */
async function contentDir(): Promise<string | null> {
  // The server runs from apps/web in dev and from the repo root on some hosts, like the role-pack loader.
  for (const dir of [path.resolve(process.cwd(), "content/practice"), path.resolve(process.cwd(), "../../content/practice")]) {
    if (await stat(dir).then((s) => s.isDirectory(), () => false)) return dir;
  }
  return null;
}

let loading: Promise<Map<string, PracticeTask>> | null = null;

async function load(): Promise<Map<string, PracticeTask>> {
  const tasks = new Map<string, PracticeTask>();
  const root = await contentDir();
  if (!root) return tasks; // no practice content deployed
  const projects = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const project of projects.sort()) {
    const dir = path.join(root, project);
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
      const task = JSON.parse(await readFile(path.join(dir, f), "utf8")) as PracticeTask;
      tasks.set(task.slug, task);
    }
  }
  return tasks;
}

function all(): Promise<Map<string, PracticeTask>> {
  loading ??= load().catch((err) => {
    loading = null; // don't cache a failure
    throw err;
  });
  return loading;
}

export function summarize(t: PracticeTask): PracticeTaskSummary {
  const { files: _files, passToPass, ...rest } = t;
  return { ...rest, passToPassCount: passToPass.length };
}

/** Every task, smallest fix first: a rough easy-to-hard order. */
export async function listPracticeTasks(): Promise<PracticeTaskSummary[]> {
  return [...(await all()).values()].sort((a, b) => a.fixSize - b.fixSize || a.slug.localeCompare(b.slug)).map(summarize);
}

export async function getPracticeTask(slug: string): Promise<PracticeTask | null> {
  return (await all()).get(slug) ?? null;
}

/** The task behind a run's problem slug ("practice:<slug>"), or null for simulations. */
export async function practiceTaskForRun(problemSlug: string): Promise<PracticeTask | null> {
  return problemSlug.startsWith(PRACTICE_RUN_PREFIX) ? getPracticeTask(problemSlug.slice(PRACTICE_RUN_PREFIX.length)) : null;
}
