import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunEvent } from "@casebench/domain";
import { appendRunEvent, getRun, insertRun } from "./runs";
import { addComment, listComments, setLike, setRating, socialSummaries } from "./social";
import {
  baseHandle,
  createUser,
  generateProfileKey,
  getUserByHandle,
  verifyProfileKey,
  mergeGuestInto,
  recentSolvers,
  solvedBy,
} from "./accounts";

const url = process.env.TEST_DATABASE_URL;
const at = "2026-01-01T00:00:00.000Z";

describe("baseHandle", () => {
  it("makes a valid handle from any name", () => {
    expect(baseHandle("Priya Nandan")).toBe("priya-nandan");
    expect(baseHandle("  José!! ")).toBe("jose");
    expect(baseHandle("a")).toBe("user-a");
    expect(baseHandle("😀")).toBe("user-x");
  });
});

describe.skipIf(!url)("accounts (Postgres)", () => {
  let pool: pg.Pool;
  const slug = `sim-${randomUUID().slice(0, 8)}`;
  const tag = randomUUID().slice(0, 6);
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool.end();
  });

  async function finish(userId: string, score: number, publish = false) {
    const run = await insertRun(pool, slug, userId);
    const events = [
      { type: "brief_viewed", at },
      { type: "submission_finalized", at, submission: {} },
      { type: "evaluation_returned", at, score, feedback: {} },
    ] as RunEvent[];
    if (publish) events.push({ type: "run_published", at });
    for (const e of events) await appendRunEvent(pool, run.id, userId, e);
    return run.id;
  }

  const newUser = async (name: string) => (await createUser(pool, { id: randomUUID(), displayName: name })).user;

  it("creates profiles with unique handles; the key signs in, nothing else does", async () => {
    const { user: a, key } = await createUser(pool, { id: randomUUID(), displayName: `Sam ${tag}` });
    const b = await newUser(`Sam ${tag}`);
    expect(a.handle).toBe(`sam-${tag}`);
    expect(b.handle).toBe(`sam-${tag}-2`);
    expect(key).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect((await verifyProfileKey(pool, `@${a.handle.toUpperCase()}`, ` ${key.toUpperCase()} `))?.id).toBe(a.id);
    expect(await verifyProfileKey(pool, a.handle, generateProfileKey())).toBeNull();
    expect(await verifyProfileKey(pool, b.handle, key)).toBeNull();
    expect((await getUserByHandle(pool, a.handle.toUpperCase()))?.id).toBe(a.id);
  });

  it("a profile created from a guest keeps that guest's history", async () => {
    const guest = randomUUID();
    await finish(guest, 70);
    const { user: u } = await createUser(pool, { id: guest, displayName: `Kept ${tag}` });
    expect((await solvedBy(pool, u.id)).map((s) => s.slug)).toEqual([slug]);
  });

  it("merges a guest's runs (even published ones), likes, ratings and comments into a profile", async () => {
    const u = await newUser(`Merge ${tag}`);
    const guest = randomUUID();
    const published = await finish(guest, 80, true);
    await setLike(pool, slug, guest, true);
    await setRating(pool, slug, guest, 2);
    await setLike(pool, slug, u.id, true); // the profile already liked it
    await addComment(pool, slug, guest, "guest", "hello");

    const likesBefore = (await socialSummaries(pool, [slug])).get(slug)!.likes;
    await mergeGuestInto(pool, guest, u.id);

    expect((await getRun(pool, published, u.id)).status).toBe("published");
    expect((await solvedBy(pool, u.id))[0]).toMatchObject({ slug, bestScore: 80 });
    expect((await socialSummaries(pool, [slug])).get(slug)!.likes).toBe(likesBefore - 1); // two likes became one
    const mine = (await listComments(pool, slug, u.id)).filter((c) => c.mine);
    expect(mine).toHaveLength(1);
    expect(mine[0].authorHandle).toBe(u.handle);
    expect((await recentSolvers(pool, slug)).map((s) => s.handle)).toContain(u.handle);
    // Finishing again is another completion, but still one solver.
    const { solverStats } = await import("./social");
    const before = (await solverStats(pool, [slug])).get(slug)!;
    await finish(u.id, 90);
    const after = (await solverStats(pool, [slug])).get(slug)!;
    expect(after.completions).toBe(before.completions + 1);
    expect(after.solvers).toBe(before.solvers);
  });

  it("still refuses any other change to a published run", async () => {
    const guest = randomUUID();
    const id = await finish(guest, 50, true);
    await expect(pool.query(`update runs set status = 'evaluated' where id = $1`, [id])).rejects.toThrow(/immutable/);
  });
});
