/**
 * A practice task: a real bug that was fixed in an open-source project, turned
 * into an exercise (see content/practice and research/practice-mode-spike).
 * The learner gets the code as it was before the fix and must make the
 * project's own tests pass. The real fix is never stored.
 */
export interface PracticeTask {
  slug: string;
  title: string;
  project: { name: string; repo: string; license: string; upstreamPullRequest: number | null };
  baseCommit: string;
  fixCommit: string;
  language: "python";
  /** Lines the real fix added to the source: a rough size signal. */
  fixSize: number;
  /** Files the learner may change. */
  editable: string[];
  testFiles: string[];
  /** Tests that fail on the starting code and pass once the bug is fixed. */
  failToPass: string[];
  /** Tests that already pass and must keep passing. */
  passToPass: string[];
  /** Every project file the tests need, by path. */
  files: Record<string, string>;
}

/** What the task list and page show before the files are needed. */
export type PracticeTaskSummary = Omit<PracticeTask, "files" | "passToPass"> & { passToPassCount: number };

/** Run slugs are "practice:<task slug>", so practice runs share the runs table with simulations. */
export const PRACTICE_RUN_PREFIX = "practice:";

/** A rough difficulty from the size of the real fix. */
export function sizeLabel(fixSize: number): { label: string; color: string } {
  if (fixSize <= 5) return { label: "Small fix", color: "var(--good)" };
  if (fixSize <= 15) return { label: "Medium fix", color: "var(--accent)" };
  return { label: "Larger fix", color: "var(--warn)" };
}
