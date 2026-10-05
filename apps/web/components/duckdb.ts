import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

/**
 * The SQL sandbox engine: DuckDB compiled to WebAssembly, running in a Web
 * Worker in the user's browser. The data never round-trips to our server
 * for querying, the page never freezes on a slow query, and the user gets
 * real analytical SQL (window functions, date_trunc, CTEs).
 *
 * The engine files come from the jsDelivr CDN by default. Set
 * NEXT_PUBLIC_DUCKDB_BUNDLE=local (and run `pnpm duckdb:local`) to serve
 * them from /public/duckdb instead.
 */

let connection: Promise<AsyncDuckDBConnection> | null = null;
let database: AsyncDuckDB | null = null;

async function connect(): Promise<AsyncDuckDBConnection> {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundles: import("@duckdb/duckdb-wasm").DuckDBBundles =
    process.env.NEXT_PUBLIC_DUCKDB_BUNDLE === "local"
      ? {
          mvp: {
            mainModule: new URL("/duckdb/duckdb-mvp.wasm", location.origin).href,
            mainWorker: new URL("/duckdb/duckdb-browser-mvp.worker.js", location.origin).href,
          },
          eh: {
            mainModule: new URL("/duckdb/duckdb-eh.wasm", location.origin).href,
            mainWorker: new URL("/duckdb/duckdb-browser-eh.worker.js", location.origin).href,
          },
        }
      : duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  // Workers must be same-origin; a tiny blob that imports the real worker gets around that.
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
  );
  const worker = new Worker(workerUrl);
  database = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  const conn = await database.connect();
  // Never download extensions on the fly: everything the sandbox needs is in
  // the core engine, and a blocked download shows up as a cryptic error.
  await conn.query("SET autoinstall_known_extensions = false");
  await conn.query("SET autoload_known_extensions = false");
  return conn;
}

export function getConnection(): Promise<AsyncDuckDBConnection> {
  connection ??= connect();
  return connection;
}

export interface TableInfo {
  name: string;
  rows: number;
  columns: Array<{ name: string; type: string }>;
}

/** Downloads each CSV from our API and loads it as a typed DuckDB table. */
export async function loadTables(problemSlug: string, files: string[]): Promise<TableInfo[]> {
  const conn = await getConnection();
  const tables: TableInfo[] = [];
  for (const file of files) {
    const name = file.replace(/^.*\//, "").replace(/\.csv$/, "");
    const res = await fetch(`/api/problems/${problemSlug}/data/${name}.csv`);
    if (!res.ok) throw new Error(`Couldn't load ${name}.csv (HTTP ${res.status})`);
    await database!.registerFileText(`${name}.csv`, await res.text());
    await conn.query(`CREATE OR REPLACE TABLE ${name} AS SELECT * FROM read_csv('${name}.csv', header = true)`);
    // Timestamps ending in "Z" are sniffed as TIMESTAMP WITH TIME ZONE, whose
    // functions (date_trunc, …) need the ICU extension. All data is UTC, so
    // store them as plain TIMESTAMPs and keep every date function in core.
    const tz = await conn.query(
      `SELECT column_name FROM (DESCRIBE ${name}) WHERE column_type = 'TIMESTAMP WITH TIME ZONE'`
    );
    for (const r of tz.toArray()) {
      const col = (r.toJSON() as { column_name: string }).column_name;
      await conn.query(`ALTER TABLE ${name} ALTER ${col} TYPE TIMESTAMP`);
    }
    const cols = await conn.query(`DESCRIBE ${name}`);
    const count = await conn.query(`SELECT COUNT(*) AS n FROM ${name}`);
    tables.push({
      name,
      rows: Number(count.toArray()[0].toJSON().n),
      columns: cols.toArray().map((r) => {
        const row = r.toJSON() as { column_name: string; column_type: string };
        return { name: row.column_name, type: row.column_type };
      }),
    });
  }
  return tables;
}

export interface QueryResult {
  columns: string[];
  rows: string[][];
  rowCount: number;
  ms: number;
}

const MAX_DISPLAY_ROWS = 500;

export async function runQuery(sql: string): Promise<QueryResult> {
  const conn = await getConnection();
  const started = performance.now();
  const table = await conn.query(sql);
  const ms = Math.round(performance.now() - started);
  const fields = table.schema.fields;
  const rows = table
    .toArray()
    .slice(0, MAX_DISPLAY_ROWS)
    .map((r) => {
      const obj = r.toJSON() as Record<string, unknown>;
      return fields.map((f) => formatValue(obj[f.name], String(f.type)));
    });
  return { columns: fields.map((f) => f.name), rows, rowCount: table.numRows, ms };
}

/** Arrow values → display strings (BigInt counts, epoch-ms timestamps, dates). */
function formatValue(v: unknown, type: string): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number" && type.startsWith("Timestamp")) return new Date(v).toISOString().replace(".000Z", "Z");
  if (typeof v === "number" && type.startsWith("Date")) return new Date(v).toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
