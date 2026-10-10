import type { TestResult } from "./runner";
import type { PracticeTask } from "./types";

const MAX_FILE_BYTES = 200_000;

export interface PracticeSubmission {
  /** The learner's version of each file they were allowed to edit. */
  files: Record<string, string>;
  testsPassed: number;
  testsTotal: number;
  /**
   * Where the tests ran. Section 1 runs them only in the learner's browser,
   * so a result could be faked; checking on the server needs a proper sandbox
   * and comes later. Recorded so nobody mistakes this for a server check.
   */
  checkedIn: "browser";
}

export type ParsedSubmission =
  | { ok: true; submission: PracticeSubmission; failing: string[] }
  | { ok: false; status: 400 | 422; error: string; failing?: string[] };

/**
 * Validates a practice submission: the code may only change editable files,
 * and the reported results must cover every required test, all passing.
 * A submission with failing tests is refused (422): only a fix counts.
 */
export function parsePracticeSubmission(body: unknown, task: PracticeTask): ParsedSubmission {
  const b = (body && typeof body === "object" ? body : {}) as { files?: unknown; results?: unknown };

  if (!b.files || typeof b.files !== "object") return { ok: false, status: 400, error: "files must be an object of path → code" };
  const files: Record<string, string> = {};
  for (const [p, code] of Object.entries(b.files as Record<string, unknown>)) {
    if (!task.editable.includes(p)) return { ok: false, status: 400, error: `${p} isn't a file you can change in this task` };
    if (typeof code !== "string") return { ok: false, status: 400, error: `${p} must be text` };
    if (Buffer.byteLength(code) > MAX_FILE_BYTES) return { ok: false, status: 400, error: `${p} is too large` };
    files[p] = code;
  }
  if (Object.keys(files).length === 0) return { ok: false, status: 400, error: "No code was sent" };

  if (!Array.isArray(b.results)) return { ok: false, status: 400, error: "results must be the list of test results" };
  const outcome = new Map<string, string>();
  for (const r of b.results as Array<Partial<TestResult>>) {
    if (r && typeof r.id === "string" && typeof r.outcome === "string") outcome.set(r.id, r.outcome);
  }
  const required = [...task.failToPass, ...task.passToPass];
  const failing = required.filter((id) => outcome.get(id) !== "passed");
  if (failing.length) {
    return {
      ok: false,
      status: 422,
      error: `${failing.length} of ${required.length} required tests aren't passing yet`,
      failing,
    };
  }
  return {
    ok: true,
    submission: { files, testsPassed: required.length, testsTotal: required.length, checkedIn: "browser" },
    failing,
  };
}
