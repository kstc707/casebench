/**
 * Checks every practice task with the same Pyodide runner the browser uses:
 *
 *   - on the starting code, the "prove the fix" tests fail and every other
 *     required test passes (so the task is solvable and its grading is right);
 *   - with --fix-repo PATH (a clone of the project), the real fix is applied
 *     and every required test passes.
 *
 * Needs public/pyodide-wheels (run `pnpm pyodide` first). Usage:
 *   pnpm exec tsx scripts/check-practice-tasks.ts [--fix-repo PATH]
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadPyodide } from "pyodide";
import { installWheels, runTests } from "../lib/practice/runner";
import type { PracticeTask } from "../lib/practice/types";

const root = path.resolve(__dirname, "../../..");
const fixRepo = process.argv.includes("--fix-repo") ? process.argv[process.argv.indexOf("--fix-repo") + 1] : null;

const taskFiles = readdirSync(path.join(root, "content/practice"), { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".json"))
  .map((f) => path.join(root, "content/practice", f));

async function main() {
  const py = await loadPyodide();
  const wheelDir = path.resolve(__dirname, "../public/pyodide-wheels");
  const names = JSON.parse(readFileSync(path.join(wheelDir, "manifest.json"), "utf8")) as string[];
  installWheels(py, names.map((name) => ({ name, data: readFileSync(path.join(wheelDir, name)) })));

  let failures = 0;
  for (const file of taskFiles) {
    const task = JSON.parse(readFileSync(file, "utf8")) as PracticeTask;
    const required = [...task.failToPass, ...task.passToPass];
    const problems: string[] = [];

    const before = await runTests(py, task.files, required);
    const byId = new Map(before.results.map((r) => [r.id, r.outcome]));
    if (before.error) problems.push(`starting code: pytest error\n${before.error}`);
    for (const id of task.failToPass) if (byId.get(id) !== "failed") problems.push(`starting code: expected ${id} to fail, got ${byId.get(id)}`);
    for (const id of task.passToPass) if (byId.get(id) !== "passed") problems.push(`starting code: expected ${id} to pass, got ${byId.get(id)}`);
    let line = `${task.slug}: start ${before.results.filter((r) => r.outcome === "failed").length} failing / ${required.length} (${before.durationMs} ms)`;

    if (fixRepo) {
      const fixed = { ...task.files };
      for (const f of task.editable) fixed[f] = execFileSync("git", ["-C", fixRepo, "show", `${task.fixCommit}:${f}`], { encoding: "utf8" });
      const after = await runTests(py, fixed, required);
      const notPassing = after.results.filter((r) => r.outcome !== "passed");
      if (after.error || notPassing.length) problems.push(`with the real fix: ${notPassing.length} not passing ${after.error ?? ""}`);
      line += `; with real fix ${required.length - notPassing.length}/${required.length} pass`;
    }
    console.log(`${problems.length ? "FAIL" : "ok  "} ${line}`);
    for (const p of problems.slice(0, 5)) console.log(`     ${p}`);
    failures += problems.length ? 1 : 0;
  }
  console.log(`\n${taskFiles.length - failures} of ${taskFiles.length} tasks OK`);
  process.exit(failures ? 1 : 0);
}

void main();
