import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createScenario } from "./scenarios";
import { getUser } from "./accounts";
import {
  appendAuthorJobLog,
  CB_USER_ID,
  createAuthorJob,
  decideAuthorJob,
  finishAuthorJob,
  getAuthorJob,
  isSafeCheckSql,
  runChecksInTempTables,
} from "./authorJobs";

describe("check SQL guard", () => {
  it("allows one SELECT and nothing else", () => {
    expect(isSafeCheckSql("select count(*) > 3 as ok from orders;")).toBe(true);
    expect(isSafeCheckSql("with x as (select 1) select true as ok from x")).toBe(true);
    for (const bad of ["drop table runs", "select 1; drop table runs", "select pg_sleep(10)", "update runs set status='x'", "select set_config('a','b',false)"]) {
      expect(isSafeCheckSql(bad)).toBe(false);
    }
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("author agent jobs (Postgres)", () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("has a CB profile nobody can sign in to", async () => {
    const cb = await getUser(pool, CB_USER_ID);
    expect(cb?.displayName).toBe("CB");
  });

  it("runs checks against temp tables and leaves nothing behind", async () => {
    const results = await runChecksInTempTables(
      pool,
      [{ name: "orders", columns: [{ name: "id", type: "integer" }, { name: "amount", type: "numeric" }, { name: "placed_at", type: "timestamp" }], rows: [{ id: 1, amount: 10, placed_at: "2026-09-01 10:00:00" }, { id: 2, amount: 30, placed_at: "2026-09-02 11:00:00" }] }],
      [
        { description: "avg is 20", sql: "select avg(amount) = 20 as ok from orders" },
        { description: "wrong claim", sql: "select max(amount) > 100 as ok from orders" },
        { description: "typo", sql: "select ok from nope" },
        { description: "sneaky", sql: "select 1; drop table runs" },
        { description: "after an error, later checks still run", sql: "select count(*) = 2 as ok from orders" },
      ]
    );
    expect(results.map((r) => r.ok)).toEqual([true, false, false, false, true]);
    expect(results[2].error).toMatch(/nope/);
    const { rows } = await pool.query(`select to_regclass('orders') as t`);
    expect(rows[0].t).toBeNull();
  });

  it("tracks a job from running to approved, and rejection deletes the draft", async () => {
    const job = await createAuthorJob(pool, { trigger: "manual", topic: "test", requestedBy: null });
    await appendAuthorJobLog(pool, job.id, "Planning…");
    const id = randomUUID();
    const slug = `s-${id.slice(0, 8)}`;
    await createScenario(pool, { id, slug, authorId: CB_USER_ID, authorName: "CB", bundle: { x: 1 } });
    await finishAuthorJob(pool, job.id, { status: "ready", scenarioId: id, title: "T", plan: {}, brief: {}, sources: [], checks: [] });
    const ready = await getAuthorJob(pool, job.id);
    expect(ready).toMatchObject({ status: "ready", slug, title: "T" });
    expect(ready!.log[0]).toMatch(/Planning…$/);

    expect((await decideAuthorJob(pool, job.id, true))?.status).toBe("approved");
    expect(await decideAuthorJob(pool, job.id, false)).toBeNull(); // decided only once
    const { rows } = await pool.query(`select listed from scenarios where id = $1`, [id]);
    expect(rows[0].listed).toBe(true);

    const job2 = await createAuthorJob(pool, { trigger: "cron", topic: null, requestedBy: null });
    const id2 = randomUUID();
    await createScenario(pool, { id: id2, slug: `s-${id2.slice(0, 8)}`, authorId: CB_USER_ID, authorName: "CB", bundle: {} });
    await finishAuthorJob(pool, job2.id, { status: "ready", scenarioId: id2, title: "T2", plan: {}, brief: {}, sources: [], checks: [] });
    await decideAuthorJob(pool, job2.id, false);
    expect((await pool.query(`select 1 from scenarios where id = $1`, [id2])).rows).toHaveLength(0);
  });
});
