import type pg from "pg";

/**
 * Structured feedback from testers. The form's questions live here so the
 * page, the API's validation and the admin summary all agree on them.
 */

export const FEEDBACK_PERSONAS = {
  student: "Student",
  "job-seeker": "Looking for a job",
  professional: "Working professional",
  hiring: "Hiring manager or recruiter",
  educator: "Educator",
  other: "Other",
} as const;

/** Each rated 1 (poor) to 5 (great). */
export const FEEDBACK_RATINGS = {
  realism: "The problem felt like real work",
  coworkers: "The AI coworkers felt believable",
  grading: "The grading felt fair",
  ease: "It was easy to figure out what to do",
  overall: "Overall experience",
} as const;

export type FeedbackPersona = keyof typeof FEEDBACK_PERSONAS;
export type FeedbackRatingKey = keyof typeof FEEDBACK_RATINGS;

export interface FeedbackInput {
  persona: FeedbackPersona;
  problemSlug: string | null;
  completed: "yes" | "partly" | "no";
  ratings: Partial<Record<FeedbackRatingKey, number>>;
  wouldUse: "yes" | "maybe" | "no";
  mostUseful: string | null;
  confusing: string | null;
  missing: string | null;
  contact: string | null;
}

export interface FeedbackRow extends FeedbackInput {
  id: string;
  userId: string;
  createdAt: string;
}

export class FeedbackValidationError extends Error {}

const TEXT_MAX = 2000;

function text(v: unknown, max = TEXT_MAX): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new FeedbackValidationError(`Please answer "${field}".`);
}

/** Checks a submitted form. Ratings are optional per question (skip what you didn't try), but at least one is needed. */
export function parseFeedback(body: unknown): FeedbackInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const ratingsIn = (b.ratings && typeof b.ratings === "object" ? b.ratings : {}) as Record<string, unknown>;
  const ratings: FeedbackInput["ratings"] = {};
  for (const key of Object.keys(FEEDBACK_RATINGS) as FeedbackRatingKey[]) {
    const n = ratingsIn[key];
    if (n === undefined || n === null || n === "") continue;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 5) throw new FeedbackValidationError("Ratings go from 1 to 5.");
    ratings[key] = n;
  }
  if (Object.keys(ratings).length === 0) throw new FeedbackValidationError("Please give at least one rating.");
  const slug = text(b.problemSlug, 100);
  return {
    persona: oneOf(b.persona, Object.keys(FEEDBACK_PERSONAS) as FeedbackPersona[], "Which describes you best?"),
    problemSlug: slug && /^[a-z0-9-]+$/.test(slug) ? slug : null,
    completed: oneOf(b.completed, ["yes", "partly", "no"] as const, "Did you finish a problem?"),
    ratings,
    wouldUse: oneOf(b.wouldUse, ["yes", "maybe", "no"] as const, "Would you use it to prepare for a job?"),
    mostUseful: text(b.mostUseful),
    confusing: text(b.confusing),
    missing: text(b.missing),
    contact: text(b.contact, 200),
  };
}

const toRow = (r: Record<string, any>): FeedbackRow => ({
  id: r.id,
  userId: r.user_id,
  persona: r.persona,
  problemSlug: r.problem_slug,
  completed: r.completed,
  ratings: r.ratings,
  wouldUse: r.would_use,
  mostUseful: r.most_useful,
  confusing: r.confusing,
  missing: r.missing,
  contact: r.contact,
  createdAt: new Date(r.created_at).toISOString(),
});

export class FeedbackRateLimitError extends Error {}

/** Saves one response. At most 5 per person a day, so the form can't be used to flood the table. */
export async function submitFeedback(pool: pg.Pool, userId: string, input: FeedbackInput): Promise<FeedbackRow> {
  const { rows: recent } = await pool.query(
    `select count(*)::int as n from feedback where user_id = $1 and created_at > now() - interval '1 day'`,
    [userId]
  );
  if (recent[0].n >= 5) throw new FeedbackRateLimitError("Thanks! You've already sent a lot of feedback today.");
  const { rows } = await pool.query(
    `insert into feedback (user_id, persona, problem_slug, completed, ratings, would_use, most_useful, confusing, missing, contact)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [userId, input.persona, input.problemSlug, input.completed, JSON.stringify(input.ratings), input.wouldUse, input.mostUseful, input.confusing, input.missing, input.contact]
  );
  return toRow(rows[0]);
}

export async function listFeedback(pool: pg.Pool, limit = 200): Promise<FeedbackRow[]> {
  const { rows } = await pool.query(`select * from feedback order by created_at desc limit $1`, [limit]);
  return rows.map(toRow);
}

export interface FeedbackSummary {
  responses: number;
  /** Average per rating question, over the responses that answered it. */
  ratings: Record<FeedbackRatingKey, { avg: number | null; count: number }>;
  wouldUse: Record<"yes" | "maybe" | "no", number>;
  personas: Partial<Record<FeedbackPersona, number>>;
}

/** Totals for the admin page, computed from rows (small table; keeps the maths in one tested place). */
export function summarizeFeedback(rows: FeedbackRow[]): FeedbackSummary {
  const ratings = {} as FeedbackSummary["ratings"];
  for (const key of Object.keys(FEEDBACK_RATINGS) as FeedbackRatingKey[]) {
    const values = rows.map((r) => r.ratings[key]).filter((n): n is number => typeof n === "number");
    ratings[key] = { avg: values.length ? Math.round((10 * values.reduce((a, b) => a + b, 0)) / values.length) / 10 : null, count: values.length };
  }
  const wouldUse = { yes: 0, maybe: 0, no: 0 };
  const personas: FeedbackSummary["personas"] = {};
  for (const r of rows) {
    wouldUse[r.wouldUse]++;
    personas[r.persona] = (personas[r.persona] ?? 0) + 1;
  }
  return { responses: rows.length, ratings, wouldUse, personas };
}
