import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunEvent } from "@casebench/domain";
import { appendRunEvent, insertRun } from "./runs";
import {
  addComment,
  deleteComment,
  listComments,
  NotFinishedError,
  setLike,
  setRating,
  socialSummaries,
  solverStats,
  viewerState,
} from "./social";

const url = process.env.TEST_DATABASE_URL;
const at = "2026-01-01T00:00:00.000Z";

describe.skipIf(!url)("community (Postgres)", () => {
  let pool: pg.Pool;
  const slug = `sim-${randomUUID().slice(0, 8)}`;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool.end();
  });

  async function finish(userId: string, score: number) {
    const run = await insertRun(pool, slug, userId);
    for (const e of [
      { type: "brief_viewed", at },
      { type: "submission_finalized", at, submission: {} },
      { type: "evaluation_returned", at, score, feedback: {} },
    ] as RunEvent[]) {
      await appendRunEvent(pool, run.id, userId, e);
    }
  }

  it("computes attempts, completions and average score from runs", async () => {
    await finish(randomUUID(), 80);
    await finish(randomUUID(), 60);
    await insertRun(pool, slug, randomUUID()); // started, never finished
    const s = (await solverStats(pool, [slug])).get(slug)!;
    expect(s).toMatchObject({ attempts: 3, completions: 2, solvers: 2, avgScore: 70, attemptsLast7Days: 3 });
  });

  it("likes are one per person and can be undone", async () => {
    const u = randomUUID();
    await setLike(pool, slug, u, true);
    await setLike(pool, slug, u, true);
    expect((await socialSummaries(pool, [slug])).get(slug)!.likes).toBe(1);
    expect((await viewerState(pool, slug, u)).liked).toBe(true);
    await setLike(pool, slug, u, false);
    expect((await socialSummaries(pool, [slug])).get(slug)!.likes).toBe(0);
  });

  it("only people who finished can rate; re-rating replaces", async () => {
    const outsider = randomUUID();
    await expect(setRating(pool, slug, outsider, 5)).rejects.toBeInstanceOf(NotFinishedError);

    const solver = randomUUID();
    await finish(solver, 90);
    await setRating(pool, slug, solver, 2);
    await setRating(pool, slug, solver, 4);
    const s = (await socialSummaries(pool, [slug])).get(slug)!;
    expect(s).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
    await expect(pool.query(`insert into simulation_ratings (slug, user_id, stars) values ($1, $2, 9)`, [slug, randomUUID()])).rejects.toThrow();
  });

  it("comments show newest first, mark solvers, and only the author can delete", async () => {
    const solver = randomUUID();
    await finish(solver, 75);
    const lurker = randomUUID();
    await addComment(pool, slug, lurker, "Lurker", "Looks hard");
    await addComment(pool, slug, solver, "Solver", "The release calendar is the clue!");
    const list = await listComments(pool, slug, lurker);
    expect(list.map((c) => c.authorName)).toEqual(["Solver", "Lurker"]);
    expect(list[0].authorFinished).toBe(true);
    expect(list[1]).toMatchObject({ mine: true, authorFinished: false });

    expect(await deleteComment(pool, list[0].id, lurker)).toBe(false);
    expect(await deleteComment(pool, list[1].id, lurker)).toBe(true);
    expect(await listComments(pool, slug, null)).toHaveLength(1);
  });
});
