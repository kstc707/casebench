import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IllegalTransitionError, type RunEvent } from "@casebench/domain";
import {
  appendRunEvent,
  getPublishedRun,
  getRun,
  insertRun,
  isUniqueViolation,
  listRuns,
  publishRun,
  RunNotFoundError,
} from "./runs";

/**
 * Integration tests against a real, migrated Postgres. Skipped unless
 * TEST_DATABASE_URL is set, e.g.:
 *   TEST_DATABASE_URL=postgres://localhost/casebench_test pnpm test
 */
const url = process.env.TEST_DATABASE_URL;
const at = "2026-01-01T00:00:00.000Z";

describe.skipIf(!url)("run repository (Postgres)", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await pool.query("truncate runs, run_events, portfolio_entries cascade");
  });

  afterAll(async () => {
    await pool.end();
  });

  async function publishedRun(userId: string) {
    const run = await insertRun(pool, "p", userId);
    const events: RunEvent[] = [
      { type: "brief_viewed", at },
      { type: "submission_finalized", at, submission: { text: "answer" } },
      { type: "evaluation_returned", at, score: 0.9, feedback: {} },
      { type: "run_published", at },
    ];
    for (const e of events) await appendRunEvent(pool, run.id, userId, e);
    return run;
  }

  it("persists a new run with its start event", async () => {
    const userId = randomUUID();
    const run = await insertRun(pool, "watch-time-decline", userId);
    const loaded = await getRun(pool, run.id, userId);
    expect(loaded.status).toBe("started");
    expect(loaded.problemSlug).toBe("watch-time-decline");
    expect(loaded.events.map((e) => e.type)).toEqual(["run_started"]);
  });

  it("appends events in order and advances status", async () => {
    const userId = randomUUID();
    const run = await insertRun(pool, "p", userId);
    await appendRunEvent(pool, run.id, userId, { type: "brief_viewed", at });
    const summary = await appendRunEvent(pool, run.id, userId, {
      type: "resource_opened",
      at,
      resourceTitle: "Data dictionary",
    });
    expect(summary.status).toBe("in_progress");

    const loaded = await getRun(pool, run.id, userId);
    expect(loaded.events.map((e) => e.type)).toEqual([
      "run_started",
      "brief_viewed",
      "resource_opened",
    ]);
  });

  it("rejects illegal transitions without writing anything", async () => {
    const userId = randomUUID();
    const run = await insertRun(pool, "p", userId);
    await expect(
      appendRunEvent(pool, run.id, userId, { type: "evaluation_returned", at, score: 1, feedback: {} })
    ).rejects.toBeInstanceOf(IllegalTransitionError);

    const loaded = await getRun(pool, run.id, userId);
    expect(loaded.status).toBe("started");
    expect(loaded.events).toHaveLength(1);
  });

  it("hides other users' runs", async () => {
    const owner = randomUUID();
    const run = await insertRun(pool, "p", owner);
    const stranger = randomUUID();
    await expect(getRun(pool, run.id, stranger)).rejects.toBeInstanceOf(RunNotFoundError);
    await expect(
      appendRunEvent(pool, run.id, stranger, { type: "brief_viewed", at })
    ).rejects.toBeInstanceOf(RunNotFoundError);
    expect(await listRuns(pool, stranger)).toEqual([]);
  });

  it("lists a user's runs, optionally filtered by problem", async () => {
    const userId = randomUUID();
    await insertRun(pool, "a", userId);
    await insertRun(pool, "b", userId);
    expect(await listRuns(pool, userId)).toHaveLength(2);
    const onlyA = await listRuns(pool, userId, "a");
    expect(onlyA.map((r) => r.problemSlug)).toEqual(["a"]);
  });

  it("serializes concurrent appends to the same run", async () => {
    const userId = randomUUID();
    const run = await insertRun(pool, "p", userId);
    await appendRunEvent(pool, run.id, userId, { type: "brief_viewed", at });

    // Two submissions racing: exactly one may win.
    const results = await Promise.allSettled([
      appendRunEvent(pool, run.id, userId, { type: "submission_finalized", at, submission: 1 }),
      appendRunEvent(pool, run.id, userId, { type: "submission_finalized", at, submission: 2 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const loaded = await getRun(pool, run.id, userId);
    expect(loaded.events.filter((e) => e.type === "submission_finalized")).toHaveLength(1);
  });

  it("enforces published-run immutability in the database itself", async () => {
    const userId = randomUUID();
    const run = await publishedRun(userId);

    // Bypass the app layer entirely: the triggers must still refuse.
    await expect(
      pool.query("update runs set status = 'in_progress' where id = $1", [run.id])
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query(
        "insert into run_events (run_id, event_type, payload) values ($1, 'brief_viewed', '{}')",
        [run.id]
      )
    ).rejects.toThrow(/published/);
  });
});

describe.skipIf(!url)("agents and publishing (Postgres)", () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("lets each proactive trigger post only once per run", async () => {
    const userId = randomUUID();
    const run = await insertRun(pool, "p", userId);
    const msg: RunEvent = { type: "message_received", at, channel: "priya", text: "hi", trigger: "kickoff" };
    await appendRunEvent(pool, run.id, userId, msg);
    const err = await appendRunEvent(pool, run.id, userId, msg).catch((e) => e);
    expect(isUniqueViolation(err)).toBe(true);

    // Replies (trigger: null) are unlimited.
    const reply: RunEvent = { ...msg, trigger: null };
    await appendRunEvent(pool, run.id, userId, reply);
    await appendRunEvent(pool, run.id, userId, reply);
    expect((await getRun(pool, run.id, userId)).events).toHaveLength(4);
  });

  it("publishes atomically with a portfolio entry, then serves it publicly", async () => {
    const userId = randomUUID();
    const run = await insertRun(pool, "p", userId);
    for (const e of [
      { type: "brief_viewed", at },
      { type: "submission_finalized", at, submission: {} },
      { type: "evaluation_returned", at, score: 81, feedback: {} },
    ] as RunEvent[]) {
      await appendRunEvent(pool, run.id, userId, e);
    }
    expect(await getPublishedRun(pool, run.id)).toBeNull(); // not public yet

    await publishRun(pool, run.id, userId, "Found the duplicate-event bug.", 81);
    const published = await getPublishedRun(pool, run.id);
    expect(published?.portfolio.score).toBe(81);
    expect(published?.run.events.at(-1)?.type).toBe("run_published");

    // Publishing twice fails and leaves exactly one portfolio entry.
    await expect(publishRun(pool, run.id, userId, "again", 90)).rejects.toThrow();
    const { rows } = await pool.query("select count(*)::int as n from portfolio_entries where run_id = $1", [run.id]);
    expect(rows[0].n).toBe(1);
  });
});
