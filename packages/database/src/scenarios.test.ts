import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createScenario,
  deleteScenario,
  getScenarioBySlug,
  getScenarioForAuthor,
  listListedScenarios,
  listMyScenarios,
  ScenarioNotFoundError,
  updateScenario,
} from "./scenarios";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("scenario repository (Postgres)", () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool.end();
  });

  const make = (authorId: string) => {
    const id = randomUUID();
    return createScenario(pool, { id, slug: `s-${id.slice(0, 8)}`, authorId, authorName: "Alex", bundle: { v: 1 } });
  };

  it("creates, reads, and updates for the author only", async () => {
    const author = randomUUID();
    const s = await make(author);
    expect((await getScenarioForAuthor(pool, s.id, author)).bundle).toEqual({ v: 1 });

    const stranger = randomUUID();
    await expect(getScenarioForAuthor(pool, s.id, stranger)).rejects.toBeInstanceOf(ScenarioNotFoundError);
    await expect(updateScenario(pool, { id: s.id, authorId: stranger, bundle: { v: 666 } })).rejects.toBeInstanceOf(ScenarioNotFoundError);
    await expect(deleteScenario(pool, s.id, stranger)).rejects.toBeInstanceOf(ScenarioNotFoundError);

    const updated = await updateScenario(pool, { id: s.id, authorId: author, bundle: { v: 2 } });
    expect(updated.bundle).toEqual({ v: 2 });
    expect(updated.listed).toBe(false);
  });

  it("is playable by link, and listed only when the author chooses", async () => {
    const author = randomUUID();
    const s = await make(author);
    expect((await getScenarioBySlug(pool, s.slug))?.id).toBe(s.id);
    expect((await listListedScenarios(pool)).some((x) => x.id === s.id)).toBe(false);

    await updateScenario(pool, { id: s.id, authorId: author, listed: true });
    expect((await listListedScenarios(pool)).some((x) => x.id === s.id)).toBe(true);
    expect((await listMyScenarios(pool, author)).map((x) => x.id)).toEqual([s.id]);

    await deleteScenario(pool, s.id, author);
    expect(await getScenarioBySlug(pool, s.slug)).toBeNull();
  });
});
