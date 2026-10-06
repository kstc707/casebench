import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeedbackRateLimitError, FeedbackValidationError, listFeedback, parseFeedback, submitFeedback, summarizeFeedback, type FeedbackRow } from "./feedback";

const valid = { persona: "student", completed: "partly", wouldUse: "maybe", ratings: { realism: 4, overall: 5 } };

describe("parseFeedback", () => {
  it("accepts a valid form, trims text and drops what it doesn't know", () => {
    const f = parseFeedback({ ...valid, ratings: { ...valid.ratings, made_up: 3 }, mostUseful: "  the coworkers  ", confusing: "   ", problemSlug: "watch-time-drop" });
    expect(f.ratings).toEqual({ realism: 4, overall: 5 });
    expect(f.mostUseful).toBe("the coworkers");
    expect(f.confusing).toBeNull();
    expect(f.problemSlug).toBe("watch-time-drop");
  });

  it("rejects missing choices and out-of-range ratings", () => {
    expect(() => parseFeedback({ ...valid, persona: "ceo" })).toThrow(FeedbackValidationError);
    expect(() => parseFeedback({ ...valid, completed: undefined })).toThrow(/finish/);
    expect(() => parseFeedback({ ...valid, ratings: { realism: 6 } })).toThrow(/1 to 5/);
    expect(() => parseFeedback({ ...valid, ratings: { realism: 2.5 } })).toThrow(/1 to 5/);
    expect(() => parseFeedback({ ...valid, ratings: {} })).toThrow(/at least one rating/);
    expect(parseFeedback({ ...valid, problemSlug: "../etc" }).problemSlug).toBeNull();
  });

  it("caps long text", () => {
    expect(parseFeedback({ ...valid, missing: "x".repeat(5000) }).missing).toHaveLength(2000);
  });
});

describe("summarizeFeedback", () => {
  it("averages each rating over the people who answered it", () => {
    const row = (persona: string, wouldUse: string, ratings: Record<string, number>) => ({ ...parseFeedback({ ...valid, persona, wouldUse, ratings }), id: "x", userId: "u", createdAt: "" }) as FeedbackRow;
    const s = summarizeFeedback([row("student", "yes", { realism: 4, overall: 5 }), row("hiring", "no", { realism: 5 }), row("student", "yes", { grading: 2 })]);
    expect(s.responses).toBe(3);
    expect(s.ratings.realism).toEqual({ avg: 4.5, count: 2 });
    expect(s.ratings.overall).toEqual({ avg: 5, count: 1 });
    expect(s.ratings.coworkers).toEqual({ avg: null, count: 0 });
    expect(s.wouldUse).toEqual({ yes: 2, maybe: 0, no: 1 });
    expect(s.personas).toEqual({ student: 2, hiring: 1 });
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("feedback (Postgres)", () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("stores responses, lists newest first, and limits each person to 5 a day", async () => {
    const user = randomUUID();
    const first = await submitFeedback(pool, user, parseFeedback({ ...valid, contact: "@sai" }));
    expect(first.contact).toBe("@sai");
    expect(first.ratings).toEqual({ realism: 4, overall: 5 });
    for (let i = 0; i < 4; i++) await submitFeedback(pool, user, parseFeedback(valid));
    await expect(submitFeedback(pool, user, parseFeedback(valid))).rejects.toThrow(FeedbackRateLimitError);
    await submitFeedback(pool, randomUUID(), parseFeedback(valid)); // someone else is fine
    const mine = (await listFeedback(pool)).filter((r) => r.userId === user);
    expect(mine).toHaveLength(5);
    expect(mine.at(-1)!.id).toBe(first.id);
  });
});
