import type pg from "pg";
import { appendEvent, createRun, type Run, type RunEvent, type RunStatus } from "@casebench/domain";

/**
 * Persistence for runs. The domain package (packages/domain/src/run.ts)
 * decides what's legal; this module just makes it durable and safe under
 * concurrency. The Postgres triggers in migrations/0001_init.sql are the
 * last line of defence for published-run immutability.
 */

export class RunNotFoundError extends Error {
  constructor(id: string) {
    super(`Run ${id} not found`);
    this.name = "RunNotFoundError";
  }
}

export interface RunSummary {
  id: string;
  problemSlug: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
}

export async function insertRun(pool: pg.Pool, problemSlug: string, userId: string): Promise<Run> {
  const run = createRun(problemSlug, userId);
  const [startEvent] = run.events;

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "insert into runs (id, problem_slug, user_id, status) values ($1, $2, $3, $4)",
      [run.id, run.problemSlug, run.userId, run.status]
    );
    await client.query(
      "insert into run_events (run_id, event_type, payload) values ($1, $2, $3)",
      [run.id, startEvent.type, startEvent]
    );
    await client.query("commit");
    return run;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Loads a run with its full event log. Scoped to userId: a run that exists
 * but belongs to someone else is reported as not found, so run ids can't be
 * probed.
 */
export async function getRun(pool: pg.Pool, runId: string, userId: string): Promise<Run> {
  const { rows } = await pool.query(
    "select id, problem_slug, user_id, status from runs where id = $1 and user_id = $2",
    [runId, userId]
  );
  if (rows.length === 0) throw new RunNotFoundError(runId);
  const row = rows[0];

  const events = await pool.query(
    "select payload from run_events where run_id = $1 order by created_at, id",
    [runId]
  );

  return {
    id: row.id,
    problemSlug: row.problem_slug,
    userId: row.user_id,
    status: row.status,
    events: events.rows.map((r) => r.payload as RunEvent),
  };
}

export async function listRuns(
  pool: pg.Pool,
  userId: string,
  problemSlug?: string
): Promise<RunSummary[]> {
  const { rows } = await pool.query(
    `select id, problem_slug, status, created_at, updated_at
       from runs
      where user_id = $1 and ($2::text is null or problem_slug = $2)
      order by created_at desc`,
    [userId, problemSlug ?? null]
  );
  return rows.map((r) => ({
    id: r.id,
    problemSlug: r.problem_slug,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

/** True when Postgres rejected a write because of a unique index (e.g. a trigger firing twice). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * Appends one event, enforcing the state machine. The run row is locked
 * (`for update`) for the duration, so two concurrent appends to the same
 * run are serialized and each validates against the status the other left
 * behind. Throws IllegalTransitionError (from the domain package) for
 * transitions the state machine rejects.
 */
export async function appendRunEvent(
  pool: pg.Pool,
  runId: string,
  userId: string,
  event: RunEvent
): Promise<RunSummary> {
  return inTransaction(pool, (client) => appendLocked(client, runId, userId, event));
}

export interface PortfolioEntry {
  runId: string;
  problemSlug: string;
  summary: string;
  score: number | null;
  createdAt: string;
}

/**
 * Publishes a graded run: appends run_published and writes the portfolio
 * snapshot in the same transaction, so there's never a published run without
 * a portfolio entry (or the reverse). After this the triggers freeze the run.
 */
export async function publishRun(
  pool: pg.Pool,
  runId: string,
  userId: string,
  summary: string,
  score: number | null
): Promise<RunSummary> {
  return inTransaction(pool, async (client) => {
    const run = await appendLocked(client, runId, userId, { type: "run_published", at: new Date().toISOString() });
    await client.query(
      `insert into portfolio_entries (run_id, user_id, problem_slug, summary, score)
       values ($1, $2, $3, $4, $5)`,
      [runId, userId, run.problemSlug, summary, score]
    );
    return run;
  });
}

/** A published run for its public portfolio page — anyone with the link may view it. */
export async function getPublishedRun(
  pool: pg.Pool,
  runId: string
): Promise<{ run: Run; portfolio: PortfolioEntry } | null> {
  const { rows } = await pool.query(
    `select r.id, r.problem_slug, r.user_id, r.status,
            p.summary, p.score, p.created_at as published_at
       from runs r join portfolio_entries p on p.run_id = r.id
      where r.id = $1 and r.status = 'published'`,
    [runId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const events = await pool.query(
    "select payload from run_events where run_id = $1 order by created_at, id",
    [runId]
  );
  return {
    run: {
      id: row.id,
      problemSlug: row.problem_slug,
      userId: row.user_id,
      status: row.status,
      events: events.rows.map((r) => r.payload as RunEvent),
    },
    portfolio: {
      runId: row.id,
      problemSlug: row.problem_slug,
      summary: row.summary,
      score: row.score === null ? null : Number(row.score),
      createdAt: row.published_at.toISOString(),
    },
  };
}

async function inTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

async function appendLocked(
  client: pg.PoolClient,
  runId: string,
  userId: string,
  event: RunEvent
): Promise<RunSummary> {
  const { rows } = await client.query(
    "select id, problem_slug, user_id, status from runs where id = $1 and user_id = $2 for update",
    [runId, userId]
  );
  if (rows.length === 0) throw new RunNotFoundError(runId);
  const row = rows[0];

  // Only the current status matters for validation, so there's no need to
  // load the whole event log here.
  const next = appendEvent(
    { id: row.id, problemSlug: row.problem_slug, userId: row.user_id, status: row.status, events: [] },
    event
  );

  await client.query(
    "insert into run_events (run_id, event_type, payload) values ($1, $2, $3)",
    [runId, event.type, event]
  );
  const updated = await client.query(
    `update runs set status = $2, updated_at = now() where id = $1
     returning id, problem_slug, status, created_at, updated_at`,
    [runId, next.status]
  );
  const u = updated.rows[0];
  return {
    id: u.id,
    problemSlug: u.problem_slug,
    status: u.status,
    createdAt: u.created_at.toISOString(),
    updatedAt: u.updated_at.toISOString(),
  };
}
