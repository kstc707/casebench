import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type pg from "pg";

/**
 * Profiles: who people are, across browsers and devices. A profile is just a
 * name (this is a demo: no email, no password) plus a random profile key for
 * signing in on another device; only the key's hash is stored.
 *
 * Ids share the uuid space of the anonymous guest ids already stored on
 * runs, scenarios, likes, ratings and comments, so an account can simply
 * take over a guest's id, or absorb a guest's rows (mergeGuestInto).
 */

export interface User {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

const toUser = (r: Record<string, any>): User => ({
  id: r.id,
  handle: r.handle,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
});

export async function getUser(pool: pg.Pool, id: string): Promise<User | null> {
  const { rows } = await pool.query(`select * from users where id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserByHandle(pool: pg.Pool, handle: string): Promise<User | null> {
  const { rows } = await pool.query(`select * from users where handle = $1`, [handle.toLowerCase()]);
  return rows[0] ? toUser(rows[0]) : null;
}

const KEY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i

/** A random key like "k7m2-q9xa-4rtp" (about 60 bits): easy to copy, impossible to guess. */
export function generateProfileKey(): string {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Keys are long and random, so a plain SHA-256 is enough (no password-style stretching needed). */
export function hashProfileKey(key: string): string {
  return createHash("sha256").update(key.trim().toLowerCase()).digest("hex");
}

/** The profile with this handle, if the key matches. */
export async function verifyProfileKey(pool: pg.Pool, handle: string, key: string): Promise<User | null> {
  const { rows } = await pool.query(`select * from users where handle = $1`, [handle.trim().toLowerCase().replace(/^@/, "")]);
  if (!rows[0]) return null;
  const a = Buffer.from(rows[0].key_hash, "hex");
  const b = Buffer.from(hashProfileKey(key), "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? toUser(rows[0]) : null;
}

/** "Priya Nandan" / "priya.n@x" → "priya-nandan"; always a valid handle. */
export function baseHandle(raw: string): string {
  const h = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return h.length >= 2 ? h : `user-${h || "x"}`;
}

/**
 * Create a profile. `id` is the creating browser's guest id, so everything
 * that guest already did belongs to the profile. Handles are unique: "sam",
 * then "sam-2", "sam-3", ... Returns the profile and its key (shown once).
 */
export async function createUser(
  pool: pg.Pool,
  args: { id: string; displayName: string }
): Promise<{ user: User; key: string }> {
  const displayName = args.displayName.trim().slice(0, 60);
  if (!displayName) throw new Error("A name is required");
  const key = generateProfileKey();
  const base = baseHandle(displayName);
  for (let n = 1; n < 1000; n++) {
    const handle = n === 1 ? base : `${base}-${n}`;
    const { rows } = await pool.query(
      `insert into users (id, handle, display_name, key_hash) values ($1, $2, $3, $4)
       on conflict (handle) do nothing returning *`,
      [args.id, handle, displayName, hashProfileKey(key)]
    );
    if (rows[0]) return { user: toUser(rows[0]), key };
  }
  throw new Error("Could not allocate a handle");
}

export async function renameUser(pool: pg.Pool, id: string, displayName: string): Promise<User | null> {
  const { rows } = await pool.query(
    `update users set display_name = $2 where id = $1 returning *`,
    [id, displayName.trim().slice(0, 60)]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/**
 * Signing in on a browser that already has guest history: move that history
 * into the profile. One transaction, so it's all-or-nothing. Where the
 * profile already liked/rated the same simulation, the profile's choice wins.
 */
export async function mergeGuestInto(pool: pg.Pool, guestId: string, userId: string): Promise<void> {
  if (guestId === userId) return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`update runs set user_id = $2 where user_id = $1`, [guestId, userId]);
    await client.query(`update portfolio_entries set user_id = $2 where user_id = $1`, [guestId, userId]);
    await client.query(`update scenarios set author_id = $2 where author_id = $1`, [guestId, userId]);
    await client.query(`update simulation_comments set user_id = $2 where user_id = $1`, [guestId, userId]);
    for (const table of ["simulation_likes", "simulation_ratings"]) {
      await client.query(
        `update ${table} t set user_id = $2 where t.user_id = $1
           and not exists (select 1 from ${table} x where x.slug = t.slug and x.user_id = $2)`,
        [guestId, userId]
      );
      await client.query(`delete from ${table} where user_id = $1`, [guestId]);
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

const COMPLETED = "('evaluated', 'published')";

export interface SolvedEntry {
  slug: string;
  bestScore: number | null;
  attempts: number;
  firstSolvedAt: string;
}

/** What someone has finished: one row per simulation, best score first-solve date. */
export async function solvedBy(pool: pg.Pool, userId: string): Promise<SolvedEntry[]> {
  const { rows } = await pool.query(
    `select r.problem_slug as slug,
            max((ev.payload ->> 'score')::numeric) as best,
            count(distinct r.id)::int as attempts,
            min(ev.created_at) as first_solved
       from runs r
       join run_events ev on ev.run_id = r.id and ev.event_type = 'evaluation_returned'
      where r.user_id = $1 and r.status in ${COMPLETED}
      group by r.problem_slug
      order by min(ev.created_at) desc`,
    [userId]
  );
  return rows.map((r) => ({
    slug: r.slug,
    bestScore: r.best === null ? null : Math.round(Number(r.best)),
    attempts: r.attempts,
    firstSolvedAt: r.first_solved.toISOString(),
  }));
}

export interface Solver {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  solvedAt: string;
}

/** The most recent people (with accounts) who finished a simulation. */
export async function recentSolvers(pool: pg.Pool, slug: string, limit = 12): Promise<Solver[]> {
  const { rows } = await pool.query(
    `select u.handle, u.display_name, u.avatar_url, max(r.updated_at) as solved_at
       from runs r join users u on u.id = r.user_id
      where r.problem_slug = $1 and r.status in ${COMPLETED}
      group by u.id
      order by max(r.updated_at) desc
      limit $2`,
    [slug, limit]
  );
  return rows.map((r) => ({
    handle: r.handle,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    solvedAt: r.solved_at.toISOString(),
  }));
}

/** Who created each Studio simulation, for the ones whose author has an account. */
export async function authorsOf(pool: pg.Pool, slugs: string[]): Promise<Map<string, User>> {
  const { rows } = await pool.query(
    `select s.slug, u.* from scenarios s join users u on u.id = s.author_id where s.slug = any($1)`,
    [slugs]
  );
  return new Map(rows.map((r) => [r.slug as string, toUser(r)]));
}

/** Listed simulations someone created. */
export async function createdBy(pool: pg.Pool, userId: string): Promise<Array<{ slug: string; createdAt: string }>> {
  const { rows } = await pool.query(
    `select slug, created_at from scenarios where author_id = $1 and listed order by created_at desc`,
    [userId]
  );
  return rows.map((r) => ({ slug: r.slug, createdAt: r.created_at.toISOString() }));
}
