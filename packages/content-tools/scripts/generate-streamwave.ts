/**
 * Regenerates the StreamWave watch-time-decline dataset and prints the
 * measured facts. Run from the repo root:
 *
 *   pnpm --filter @casebench/content-tools generate:streamwave
 *
 * Writes CSVs into content/.../watch-time-decline/data/ and the measured
 * numbers into data/analysis.json (server-only — the truth model reads it).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COLUMNS, generateStreamwave, type Dataset } from "../src/streamwave";
import { parseCsv, toCsv } from "../src/csv";
import { analyzeStreamwave } from "../src/analyzeStreamwave";

const here = path.dirname(fileURLToPath(import.meta.url));
const SIM_DIR = path.resolve(
  here,
  "../../../content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline"
);

const data = generateStreamwave();
await mkdir(path.join(SIM_DIR, "data"), { recursive: true });

for (const table of Object.keys(COLUMNS) as (keyof Dataset)[]) {
  const file = path.join(SIM_DIR, "data", `${table}.csv`);
  await writeFile(file, toCsv(COLUMNS[table], data[table]));
  console.log(`wrote ${table}.csv (${data[table].length} rows)`);
}

// Analyze from the files just written — not from memory — so the numbers
// reflect exactly what a user downloads.
const read = async (t: string) => parseCsv(await readFile(path.join(SIM_DIR, "data", `${t}.csv`), "utf-8"));
const analysis = analyzeStreamwave({
  users: await read("users"),
  sessions: await read("sessions"),
  experiments: await read("experiments"),
});

await writeFile(path.join(SIM_DIR, "analysis.json"), JSON.stringify(analysis, null, 2) + "\n");
console.log(JSON.stringify({ changePct: analysis.changePct, duplicates: analysis.duplicates, campaign: analysis.campaign, experiment: analysis.experiment }, null, 2));
