/**
 * Promote a scenario (exported from the Studio) into official content:
 *
 *   pnpm --filter @casebench/content-tools import-scenario path/to/file.scenario.json --slug my-case [--force]
 *
 * Validates it with the same schema the app uses, then writes:
 *   content/role-packs/<role>/companies/<company>/personas/<id>.json
 *   content/role-packs/<role>/companies/<company>/simulations/<slug>/{simulation,agents,rubric}.json
 *   …/simulations/<slug>/data/*.csv
 * Review the diff, run `pnpm test`, and open a pull request.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenario } from "@casebench/simulation-engine";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const slugArg = args[args.indexOf("--slug") + 1];
const force = args.includes("--force");
if (!file || !args.includes("--slug") || !slugArg) {
  console.error("usage: import-scenario <file.json> --slug <official-slug> [--force]");
  process.exit(1);
}

const raw = JSON.parse(await readFile(path.resolve(process.cwd(), file), "utf-8"));
// The official slug replaces the Studio one ("s-…"). Only touch what exists;
// the validator reports anything missing.
if (raw?.problem && typeof raw.problem === "object") raw.problem.slug = slugArg;
if (raw?.rubric && typeof raw.rubric === "object") raw.rubric.problemSlug = slugArg;
const v = validateScenario(raw);
if (!v.ok) {
  console.error("Not a valid scenario:\n" + v.errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
const { problem, personas, agents, rubric, data } = v.bundle;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../content/role-packs");
const companyDir = path.join(root, problem.role, "companies", problem.company);
const simDir = path.join(companyDir, "simulations", problem.slug);
if (existsSync(simDir) && !force) {
  console.error(`${path.relative(root, simDir)} already exists (use --force to overwrite)`);
  process.exit(1);
}

const json = (x: unknown) => JSON.stringify(x, null, 2) + "\n";
await mkdir(path.join(companyDir, "personas"), { recursive: true });
for (const p of personas) {
  const target = path.join(companyDir, "personas", `${p.id}.json`);
  if (existsSync(target) && (await readFile(target, "utf-8")) !== json(p) && !force) {
    console.error(`persona ${p.id} already exists for ${problem.company} with different content (rename it, or --force)`);
    process.exit(1);
  }
  await writeFile(target, json(p));
}
await mkdir(path.join(simDir, "data"), { recursive: true });
await writeFile(path.join(simDir, "simulation.json"), json(problem));
await writeFile(path.join(simDir, "agents.json"), json(agents));
await writeFile(path.join(simDir, "rubric.json"), json(rubric));
for (const [name, text] of Object.entries(data ?? {})) await writeFile(path.join(simDir, "data", name), text);

console.log(`Imported "${problem.title}" → ${path.relative(process.cwd(), simDir)}`);
console.log("Next: review the files, run `pnpm test`, and open a pull request.");
