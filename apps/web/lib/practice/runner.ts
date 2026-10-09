/**
 * Types for practice-mode test runs, plus the Node side of the runner (used by
 * scripts/check-practice-tasks.ts). The test logic itself is runner.py, which
 * the browser's worker (scripts/practice-worker.mjs) loads too, so a task is
 * always tested the same way.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export type TestOutcome = "passed" | "failed" | "skipped" | "missing";

export interface TestResult {
  id: string;
  outcome: TestOutcome;
  /** The first lines of the failure, for failed tests. */
  message?: string;
}

export interface RunResult {
  results: TestResult[];
  /** pytest's own error output when it couldn't run the tests at all (e.g. a syntax error). */
  error: string | null;
  durationMs: number;
}

/** Minimal surface of a loaded Pyodide instance that the runner uses. */
export interface PyodideLike {
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: Uint8Array | string): void };
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
}

/** Unpacks pure-Python wheels (zip files) into site-packages. No network needed. (The worker does the same.) */
export function installWheels(py: PyodideLike, wheels: Array<{ name: string; data: Uint8Array }>) {
  py.FS.mkdirTree("/wheels");
  for (const w of wheels) py.FS.writeFile(`/wheels/${w.name}`, w.data);
  py.runPython(`
import os, sysconfig, zipfile
_dest = sysconfig.get_paths()["purelib"]
for _w in os.listdir("/wheels"):
    zipfile.ZipFile("/wheels/" + _w).extractall(_dest)
`);
}


let prepared = new WeakSet<object>();

/** Runs the given tests against the given project files. */
export async function runTests(py: PyodideLike, files: Record<string, string>, testIds: string[]): Promise<RunResult> {
  if (!prepared.has(py)) {
    py.runPython(readFileSync(path.join(__dirname, "runner.py"), "utf8"));
    prepared.add(py);
  }
  py.globals.set("_casebench_files", JSON.stringify(files));
  py.globals.set("_casebench_ids", JSON.stringify(testIds));
  const json = (await py.runPythonAsync("_casebench_run(_casebench_files, _casebench_ids)")) as string;
  return JSON.parse(json) as RunResult;
}

/** For tests: forget which Pyodide instances have the runner loaded. */
export function resetRunnerCache() {
  prepared = new WeakSet<object>();
}
