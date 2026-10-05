import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { getAIProvider } from "@casebench/ai";
import {
  AuthorAgentError,
  runAuthorAgent,
  type Check,
  type CheckResult,
  type DataSpec,
  type Row,
} from "@casebench/author-agent";
import {
  appendAuthorJobLog,
  CB_USER_ID,
  createAuthorJob,
  createScenario,
  failStaleAuthorJobs,
  finishAuthorJob,
  runChecksInTempTables,
  type AuthorJob,
  type CheckTable,
  type User,
} from "@casebench/database";
import { getPool } from "./db";
import { getCatalog, STUDIO_SLUG_PREFIX } from "./problems";

/**
 * Runs the author agent for the app: background job, live log, SQL checks in
 * Postgres, and a draft scenario by CB that waits in the review queue.
 */

/** Admins are profile handles listed in CASEBENCH_ADMINS (comma-separated). */
export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  const admins = (process.env.CASEBENCH_ADMINS ?? "").split(",").map((h) => h.trim().toLowerCase().replace(/^@/, ""));
  return admins.includes(user.handle);
}

/** Start a run in the background and return its job straight away; the page polls the job. */
export async function startAuthorJob(args: { trigger: "cron" | "manual"; topic: string | null; requestedBy: string | null }): Promise<AuthorJob> {
  const pool = getPool();
  await failStaleAuthorJobs(pool);
  const job = await createAuthorJob(pool, args);
  after(() => runJob(job.id, args.topic).catch((err) => console.error("author agent", err)));
  return job;
}

async function runJob(jobId: string, topic: string | null): Promise<void> {
  const pool = getPool();
  // Keep log lines in order even though the agent doesn't wait for them.
  let logging = Promise.resolve();
  const log = (line: string) => {
    logging = logging.then(() => appendAuthorJobLog(pool, jobId, line)).catch(() => {});
  };

  const id = randomUUID();
  const slug = `${STUDIO_SLUG_PREFIX}${id.slice(0, 8)}`;
  try {
    const existingTitles = (await getCatalog()).map((c) => c.problem.title);
    const result = await runAuthorAgent({
      provider: getAIProvider(),
      slug,
      topic: topic ?? undefined,
      existingTitles,
      runChecks: (spec, tables, checks) => runChecksInPostgres(spec, tables, checks),
      log,
    });
    await createScenario(pool, { id, slug, authorId: CB_USER_ID, authorName: "CB", bundle: result.bundle });
    log(`Saved draft "${result.bundle.problem.title}" (${slug}). Waiting for review.`);
    await logging;
    await finishAuthorJob(pool, jobId, {
      status: "ready",
      scenarioId: id,
      title: result.bundle.problem.title,
      plan: result.plan,
      brief: result.brief,
      sources: result.sources,
      checks: result.checks,
    });
  } catch (err) {
    const details = err instanceof AuthorAgentError && err.details.length ? `\n- ${err.details.slice(0, 10).join("\n- ")}` : "";
    log(`Failed: ${(err as Error).message}`);
    await logging;
    await finishAuthorJob(pool, jobId, { status: "failed", error: `${(err as Error).message}${details}` });
  }
}

/** Postgres column types for a data recipe's columns (refs take the type of what they point at). */
export function checkTables(spec: DataSpec, tables: Map<string, Row[]>): CheckTable[] {
  const types = new Map<string, CheckTable["columns"][number]["type"]>();
  return spec.tables.map((t) => ({
    name: t.name,
    rows: tables.get(t.name) ?? [],
    columns: t.columns.map((c) => {
      const type =
        c.kind === "id" ? (c.prefix ? "text" : "integer")
        : c.kind === "ref" ? (types.get(`${c.table}.${c.column}`) ?? "text")
        : c.kind === "number" ? "numeric"
        : c.kind === "date" ? (c.withTime ? "timestamp" : "date")
        : c.kind === "bool" ? "boolean"
        : "text";
      types.set(`${t.name}.${c.name}`, type);
      return { name: c.name, type };
    }),
  }));
}

function runChecksInPostgres(spec: DataSpec, tables: Map<string, Row[]>, checks: Check[]): Promise<CheckResult[]> {
  return runChecksInTempTables(getPool(), checkTables(spec, tables), checks);
}
