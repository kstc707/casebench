import type pg from "pg";

/**
 * Persistence for Studio scenarios. Validation happens before anything gets
 * here (simulation-engine's validateScenario); this layer stores JSON and
 * enforces that only the author can change a scenario.
 */

export interface StoredScenario {
  id: string;
  slug: string;
  authorName: string | null;
  listed: boolean;
  bundle: unknown;
  createdAt: string;
  updatedAt: string;
}

export class ScenarioNotFoundError extends Error {
  constructor(id: string) {
    super(`Scenario ${id} not found`);
    this.name = "ScenarioNotFoundError";
  }
}

const COLUMNS = "id, slug, author_name, listed, bundle, created_at, updated_at";

function toStored(r: Record<string, any>): StoredScenario {
  return {
    id: r.id,
    slug: r.slug,
    authorName: r.author_name,
    listed: r.listed,
    bundle: r.bundle,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function createScenario(
  pool: pg.Pool,
  args: { id: string; slug: string; authorId: string; authorName: string | null; bundle: unknown }
): Promise<StoredScenario> {
  const { rows } = await pool.query(
    `insert into scenarios (id, slug, author_id, author_name, bundle) values ($1, $2, $3, $4, $5)
     returning ${COLUMNS}`,
    [args.id, args.slug, args.authorId, args.authorName, args.bundle]
  );
  return toStored(rows[0]);
}

/** For editing: only the author gets it (anyone else sees "not found"). */
export async function getScenarioForAuthor(pool: pg.Pool, id: string, authorId: string): Promise<StoredScenario> {
  const { rows } = await pool.query(`select ${COLUMNS} from scenarios where id = $1 and author_id = $2`, [id, authorId]);
  if (!rows.length) throw new ScenarioNotFoundError(id);
  return toStored(rows[0]);
}

/** For playing: anyone with the slug (link) can load it. */
export async function getScenarioBySlug(pool: pg.Pool, slug: string): Promise<StoredScenario | null> {
  const { rows } = await pool.query(`select ${COLUMNS} from scenarios where slug = $1`, [slug]);
  return rows.length ? toStored(rows[0]) : null;
}

export async function updateScenario(
  pool: pg.Pool,
  args: { id: string; authorId: string; authorName?: string | null; bundle?: unknown; listed?: boolean }
): Promise<StoredScenario> {
  const { rows } = await pool.query(
    `update scenarios set
        bundle = coalesce($3, bundle),
        listed = coalesce($4, listed),
        author_name = coalesce($5, author_name),
        updated_at = now()
      where id = $1 and author_id = $2
      returning ${COLUMNS}`,
    [args.id, args.authorId, args.bundle ?? null, args.listed ?? null, args.authorName ?? null]
  );
  if (!rows.length) throw new ScenarioNotFoundError(args.id);
  return toStored(rows[0]);
}

export async function deleteScenario(pool: pg.Pool, id: string, authorId: string): Promise<void> {
  const { rowCount } = await pool.query("delete from scenarios where id = $1 and author_id = $2", [id, authorId]);
  if (!rowCount) throw new ScenarioNotFoundError(id);
}

export async function listMyScenarios(pool: pg.Pool, authorId: string): Promise<StoredScenario[]> {
  const { rows } = await pool.query(
    `select ${COLUMNS} from scenarios where author_id = $1 order by updated_at desc`,
    [authorId]
  );
  return rows.map(toStored);
}

export async function listListedScenarios(pool: pg.Pool, limit = 50): Promise<StoredScenario[]> {
  const { rows } = await pool.query(
    `select ${COLUMNS} from scenarios where listed order by updated_at desc limit $1`,
    [limit]
  );
  return rows.map(toStored);
}
