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
  const client = await pool.connect();
  try {
    await client.query("begin");
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
    await client.query("commit");

    const u = updated.rows[0];
    return {
      id: u.id,
      problemSlug: u.problem_slug,
      status: u.status,
      createdAt: u.created_at.toISOString(),
      updatedAt: u.updated_at.toISOString(),
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
