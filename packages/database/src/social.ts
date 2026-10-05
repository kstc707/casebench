import type pg from "pg";

/**
 * Community data for simulations: likes, ratings, comments, and solver stats
 * computed from the runs table (so stats can never drift from what happened).
 */

export interface SolverStatsRow {
  slug: string;
  attempts: number;
  completions: number;
  /** Distinct people who finished (one person finishing twice counts once). */
  solvers: number;
  avgScore: number | null;
  avgMinutes: number | null;
  attemptsLast7Days: number;
}

export interface SocialSummary {
  likes: number;
  ratingAvg: number | null;
  ratingCount: number;
}

const COMPLETED = "('evaluated', 'published')";

/** Attempts, completions, average score and time, for many simulations in one query. */
export async function solverStats(pool: pg.Pool, slugs: string[]): Promise<Map<string, SolverStatsRow>> {
  const { rows } = await pool.query(
    `select r.problem_slug as slug,
            count(*)::int as attempts,
            count(*) filter (where r.status in ${COMPLETED})::int as completions,
            count(distinct r.user_id) filter (where r.status in ${COMPLETED})::int as solvers,
            count(*) filter (where r.created_at > now() - interval '7 days')::int as attempts_7d,
            avg((ev.payload ->> 'score')::numeric) as avg_score,
            avg(extract(epoch from (sub.created_at - r.created_at)) / 60.0) as avg_minutes
       from runs r
       left join run_events ev on ev.run_id = r.id and ev.event_type = 'evaluation_returned'
       left join run_events sub on sub.run_id = r.id and sub.event_type = 'submission_finalized'
      where r.problem_slug = any($1)
      group by r.problem_slug`,
    [slugs]
  );
  const out = new Map<string, SolverStatsRow>();
  for (const r of rows) {
    out.set(r.slug, {
      slug: r.slug,
      attempts: r.attempts,
      completions: r.completions,
      solvers: r.solvers,
      attemptsLast7Days: r.attempts_7d,
      avgScore: r.avg_score === null ? null : Math.round(Number(r.avg_score)),
      avgMinutes: r.avg_minutes === null ? null : Math.round(Number(r.avg_minutes)),
    });
  }
  return out;
}

export async function socialSummaries(pool: pg.Pool, slugs: string[]): Promise<Map<string, SocialSummary>> {
  const [likes, ratings] = await Promise.all([
    pool.query(`select slug, count(*)::int as n from simulation_likes where slug = any($1) group by slug`, [slugs]),
    pool.query(
      `select slug, avg(stars) as avg, count(*)::int as n from simulation_ratings where slug = any($1) group by slug`,
      [slugs]
    ),
  ]);
  const out = new Map<string, SocialSummary>(slugs.map((s) => [s, { likes: 0, ratingAvg: null, ratingCount: 0 }]));
  for (const r of likes.rows) out.get(r.slug)!.likes = r.n;
  for (const r of ratings.rows) {
    const s = out.get(r.slug)!;
    s.ratingAvg = Math.round(Number(r.avg) * 10) / 10;
    s.ratingCount = r.n;
  }
  return out;
}

export async function setLike(pool: pg.Pool, slug: string, userId: string, liked: boolean): Promise<void> {
  if (liked) {
    await pool.query(
      `insert into simulation_likes (slug, user_id) values ($1, $2) on conflict do nothing`,
      [slug, userId]
    );
  } else {
    await pool.query(`delete from simulation_likes where slug = $1 and user_id = $2`, [slug, userId]);
  }
}

export class NotFinishedError extends Error {
  constructor() {
    super("Finish the simulation before rating it");
    this.name = "NotFinishedError";
  }
}

export async function hasFinished(pool: pg.Pool, slug: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from runs where problem_slug = $1 and user_id = $2 and status in ${COMPLETED} limit 1`,
    [slug, userId]
  );
  return rows.length > 0;
}

/** Rate 1–5. Only people who completed the simulation; rating again replaces it. */
export async function setRating(pool: pg.Pool, slug: string, userId: string, stars: number): Promise<void> {
  if (!(await hasFinished(pool, slug, userId))) throw new NotFinishedError();
  await pool.query(
    `insert into simulation_ratings (slug, user_id, stars) values ($1, $2, $3)
     on conflict (slug, user_id) do update set stars = excluded.stars, updated_at = now()`,
    [slug, userId, stars]
  );
}

export interface Comment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
  /** Whether the author finished the simulation — shown as a "solved it" badge. */
  authorFinished: boolean;
  /** The author's profile handle, when they have an account. */
  authorHandle: string | null;
}

export async function addComment(pool: pg.Pool, slug: string, userId: string, authorName: string, body: string) {
  await pool.query(
    `insert into simulation_comments (slug, user_id, author_name, body) values ($1, $2, $3, $4)`,
    [slug, userId, authorName, body]
  );
}

export async function listComments(pool: pg.Pool, slug: string, viewerId: string | null, limit = 50): Promise<Comment[]> {
  const { rows } = await pool.query(
    `select c.id, coalesce(u.display_name, c.author_name) as author_name, u.handle, c.body, c.created_at, c.user_id = $2 as mine,
            exists (select 1 from runs r where r.problem_slug = c.slug and r.user_id = c.user_id
                    and r.status in ${COMPLETED}) as finished
       from simulation_comments c
       left join users u on u.id = c.user_id
      where c.slug = $1
      order by c.created_at desc
      limit $3`,
    [slug, viewerId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    authorName: r.author_name,
    body: r.body,
    createdAt: r.created_at.toISOString(),
    mine: !!r.mine,
    authorFinished: r.finished,
    authorHandle: r.handle ?? null,
  }));
}

export async function deleteComment(pool: pg.Pool, id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`delete from simulation_comments where id = $1 and user_id = $2`, [id, userId]);
  return (rowCount ?? 0) > 0;
}

/** What this viewer has done: liked? rated? */
export async function viewerState(pool: pg.Pool, slug: string, userId: string) {
  const [like, rating, finished] = await Promise.all([
    pool.query(`select 1 from simulation_likes where slug = $1 and user_id = $2`, [slug, userId]),
    pool.query(`select stars from simulation_ratings where slug = $1 and user_id = $2`, [slug, userId]),
    hasFinished(pool, slug, userId),
  ]);
  return { liked: like.rows.length > 0, myRating: rating.rows[0]?.stars ?? null, finished };
}
