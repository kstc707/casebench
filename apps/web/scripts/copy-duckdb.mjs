// Copies DuckDB-WASM's engine files into public/duckdb so the SQL sandbox can
// run without the jsDelivr CDN (offline dev, locked-down networks, tests).
// Used when NEXT_PUBLIC_DUCKDB_BUNDLE=local. public/duckdb is gitignored.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm"));
const out = path.resolve("public/duckdb");
await mkdir(out, { recursive: true });
for (const f of ["duckdb-mvp.wasm", "duckdb-eh.wasm", "duckdb-browser-mvp.worker.js", "duckdb-browser-eh.worker.js"]) {
  await copyFile(path.join(dist, f), path.join(out, f));
  console.log(`copied ${f}`);
}
