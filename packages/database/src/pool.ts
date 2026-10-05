import pg from "pg";

/**
 * One pool per process. Cached on globalThis so Next.js dev-mode hot reloads
 * don't open a new pool (and leak connections) on every edit. `max` is kept
 * small because serverless platforms run many instances, each with its own
 * pool, against a database with a fixed connection limit.
 */
const globalForPool = globalThis as unknown as { __casebenchPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!globalForPool.__casebenchPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    globalForPool.__casebenchPool = new pg.Pool({ connectionString, max: 5 });
  }
  return globalForPool.__casebenchPool;
}
