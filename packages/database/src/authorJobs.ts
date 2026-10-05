import type pg from "pg";

/** The "CB" profile that publishes the author agent's simulations (created by migration 0006). */
export const CB_USER_ID = "00000000-0000-4000-8000-0000000000cb";

export type JobStatus = "running" | "ready" | "failed" | "approved" | "rejected";

export interface AuthorJob {
  id: string;
  status: JobStatus;
  trigger: "cron" | "manual";
  topic: string | null;
  scenarioId: string | null;
  slug: string | null;
  title: string | null;
  plan: unknown;
  brief: unknown;
  sources: Array<{ title: string; url: string }> | null;
  checks: Array<{ description: string; sql: string; ok: boolean; error?: string }> | null;
  log: string[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

const toJob = (r: Record<string, any>): AuthorJob => ({
  id: r.id,
  status: r.status,
  trigger: r.trigger,
  topic: r.topic,
  scenarioId: r.scenario_id,
  slug: r.slug ?? null,
  title: r.title,
  plan: r.plan,
  brief: r.brief,
  sources: r.sources,
  checks: r.checks,
  log: r.log ?? [],
  error: r.error,
  createdAt: r.created_at.toISOString(),
  finishedAt: r.finished_at ? r.finished_at.toISOString() : null,
});

const SELECT = `select j.*, s.slug from author_agent_jobs j left join scenarios s on s.id = j.scenario_id`;

export async function createAuthorJob(
  pool: pg.Pool,
  args: { trigger: "cron" | "manual"; topic: string | null; requestedBy: string | null }
): Promise<AuthorJob> {
  const { rows } = await pool.query(
    `insert into author_agent_jobs (status, trigger, topic, requested_by) values ('running', $1, $2, $3) returning *`,
    [args.trigger, args.topic, args.requestedBy]
  );
  return toJob(rows[0]);
}

export async function appendAuthorJobLog(pool: pg.Pool, id: string, line: string): Promise<void> {
  await pool.query(`update author_agent_jobs set log = log || to_jsonb($2::text) where id = $1`, [id, `${new Date().toISOString().slice(11, 19)} ${line}`]);
}

export async function finishAuthorJob(
  pool: pg.Pool,
  id: string,
  result:
    | { status: "ready"; scenarioId: string; title: string; plan: unknown; brief: unknown; sources: unknown; checks: unknown }
    | { status: "failed"; error: string; plan?: unknown; brief?: unknown; sources?: unknown }
): Promise<void> {
  if (result.status === "ready") {
    await pool.query(
      `update author_agent_jobs set status = 'ready', scenario_id = $2, title = $3, plan = $4, brief = $5, sources = $6, checks = $7, finished_at = now() where id = $1`,
      [id, result.scenarioId, result.title, JSON.stringify(result.plan), JSON.stringify(result.brief), JSON.stringify(result.sources), JSON.stringify(result.checks)]
    );
  } else {
    await pool.query(
      `update author_agent_jobs set status = 'failed', error = $2, plan = coalesce($3, plan), brief = coalesce($4, brief), sources = coalesce($5, sources), finished_at = now() where id = $1`,
      [id, result.error.slice(0, 4000), result.plan ? JSON.stringify(result.plan) : null, result.brief ? JSON.stringify(result.brief) : null, result.sources ? JSON.stringify(result.sources) : null]
    );
  }
}

export async function listAuthorJobs(pool: pg.Pool, limit = 30): Promise<AuthorJob[]> {
  const { rows } = await pool.query(`${SELECT} order by j.created_at desc limit $1`, [limit]);
  return rows.map(toJob);
}

export async function getAuthorJob(pool: pg.Pool, id: string): Promise<AuthorJob | null> {
  const { rows } = await pool.query(`${SELECT} where j.id = $1`, [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

/**
 * Approve: list the scenario in the community. Reject: delete the draft.
 * Only a job that is 'ready' can be decided, and only once.
 */
export async function decideAuthorJob(pool: pg.Pool, id: string, approve: boolean): Promise<AuthorJob | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(`select * from author_agent_jobs where id = $1 and status = 'ready' for update`, [id]);
    if (!rows[0]) {
      await client.query("rollback");
      return null;
    }
    if (approve) {
      await client.query(`update scenarios set listed = true, updated_at = now() where id = $1`, [rows[0].scenario_id]);
      await client.query(`update author_agent_jobs set status = 'approved' where id = $1`, [id]);
    } else {
      await client.query(`update author_agent_jobs set status = 'rejected', scenario_id = null where id = $1`, [id]);
      await client.query(`delete from scenarios where id = $1 and author_id = $2`, [rows[0].scenario_id, CB_USER_ID]);
    }
    await client.query("commit");
    return getAuthorJob(pool, id);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** A run that died mid-way (e.g. the function timed out) shouldn't look like it's still going. */
export async function failStaleAuthorJobs(pool: pg.Pool, olderThanMinutes = 15): Promise<void> {
  await pool.query(
    `update author_agent_jobs set status = 'failed', error = 'Timed out', finished_at = now()
      where status = 'running' and created_at < now() - make_interval(mins => $1)`,
    [olderThanMinutes]
  );
}

// ---- Running the agent's SQL checks safely ----

export interface CheckTable {
  name: string;
  columns: Array<{ name: string; type: "integer" | "text" | "numeric" | "date" | "timestamp" | "boolean" }>;
  rows: Array<Record<string, unknown>>;
}

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|prepare|set|reset|listen|notify|vacuum|lock|dblink|lo_import|lo_export|set_config|current_setting)\b|\bpg_[a-z_]*\s*\(/i;

/** One read-only SELECT (or WITH … SELECT), nothing else. */
export function isSafeCheckSql(sql: string): boolean {
  const s = sql.trim().replace(/;\s*$/, "");
  if (s.includes(";")) return false;
  if (!/^(select|with)\b/i.test(s)) return false;
  return !FORBIDDEN.test(s);
}

/**
 * Load the generated tables into temporary tables, run each check, and roll
 * everything back. Checks are model-written SQL, so: only single SELECTs, a
 * statement timeout, temp tables only (dropped on rollback), and the whole
 * transaction is always rolled back, so nothing can persist.
 */
export async function runChecksInTempTables(
  pool: pg.Pool,
  tables: CheckTable[],
  checks: Array<{ description: string; sql: string }>
): Promise<Array<{ description: string; sql: string; ok: boolean; error?: string }>> {
  const client = await pool.connect();
  const results: Array<{ description: string; sql: string; ok: boolean; error?: string }> = [];
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '8s'");
    for (const t of tables) {
      if (!/^[a-z][a-z0-9_]*$/.test(t.name) || t.columns.some((c) => !/^[a-z][a-z0-9_]*$/.test(c.name))) {
        throw new Error(`invalid table or column name in ${t.name}`);
      }
      const cols = t.columns.map((c) => `"${c.name}" ${c.type}`).join(", ");
      await client.query(`create temp table "${t.name}" (${cols}) on commit drop`);
      for (let i = 0; i < t.rows.length; i += 5000) {
        await client.query(
          `insert into "${t.name}" select * from jsonb_to_recordset($1::jsonb) as x(${cols})`,
          [JSON.stringify(t.rows.slice(i, i + 5000))]
        );
      }
    }
    for (const c of checks) {
      if (!isSafeCheckSql(c.sql)) {
        results.push({ ...c, ok: false, error: "only a single read-only SELECT is allowed" });
        continue;
      }
      await client.query("savepoint chk");
      try {
        const { rows } = await client.query(c.sql);
        const ok = rows.length === 1 && rows[0].ok === true;
        results.push(ok ? { ...c, ok } : { ...c, ok, error: rows.length !== 1 ? `returned ${rows.length} rows, expected 1` : rows[0].ok === undefined ? "no boolean column named ok" : undefined });
        await client.query("release savepoint chk");
      } catch (err) {
        await client.query("rollback to savepoint chk");
        results.push({ ...c, ok: false, error: (err as Error).message.slice(0, 300) });
      }
    }
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
  return results;
}
