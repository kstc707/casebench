import { NextResponse } from "next/server";
import { appendRunEvent, getPool, getRun } from "../../../../../../lib/db";
import { parsePracticeSubmission } from "../../../../../../lib/practice/submission";
import { practiceTaskForRun } from "../../../../../../lib/practice/tasks";
import { getUserId } from "../../../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody, runIdFrom } from "../../../../../../lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/practice/runs/:id/submit { files, results }
 *
 * Accepts a practice attempt once every required test passes:
 *   1. records the passing test run if none was logged yet (tests_run),
 *   2. freezes the learner's code (submission_finalized),
 *   3. marks it solved (evaluation_returned, score 100).
 * Failing tests → 422 with the ones still failing; nothing is recorded as solved.
 * Retry-safe: a run left "submitted" by an earlier failure is just graded.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Run not found");
    const userId = await getUserId();
    const pool = getPool();
    const run = await getRun(pool, id, userId);
    const task = await practiceTaskForRun(run.problemSlug);
    if (!task) return jsonError(404, "Not a practice run");

    let submission;
    if (run.status === "submitted") {
      submission = (run.events.find((e) => e.type === "submission_finalized") as { submission: unknown }).submission;
    } else {
      const parsed = parsePracticeSubmission(await readJsonBody(req), task);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error, failing: parsed.failing ?? [] }, { status: parsed.status });
      const at = () => new Date().toISOString();
      if (run.status === "started") {
        // Submitted without a logged test run (e.g. logging failed): record the passing run it was checked with.
        await appendRunEvent(pool, id, userId, {
          type: "tests_run",
          at: at(),
          passed: parsed.submission.testsPassed,
          total: parsed.submission.testsTotal,
          failing: [],
          error: null,
        });
      }
      await appendRunEvent(pool, id, userId, { type: "submission_finalized", at: at(), submission: parsed.submission });
      submission = parsed.submission;
    }

    const s = submission as { testsPassed: number; testsTotal: number; checkedIn: string };
    const feedback = { kind: "practice", testsPassed: s.testsPassed, testsTotal: s.testsTotal, checkedIn: s.checkedIn };
    await appendRunEvent(pool, id, userId, { type: "evaluation_returned", at: new Date().toISOString(), score: 100, feedback });
    return NextResponse.json({ solved: true, feedback });
  } catch (err) {
    return handleRouteError(err);
  }
}
