import { NextResponse } from "next/server";
import { evaluateSubmission, parseSubmission, type Submission } from "@casebench/agents";
import { DEFAULT_DELIVERABLE } from "@casebench/domain";
import { getAIProvider } from "@casebench/ai";
import { appendRunEvent, getPool, getRun } from "../../../../../lib/db";
import { getBundle } from "../../../../../lib/problems";
import { postEvaluationReaction } from "../../../../../lib/agents";
import { getUserId } from "../../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody, runIdFrom } from "../../../../../lib/api";

export const dynamic = "force-dynamic";
// Grading with the most capable model can take a while.
export const maxDuration = 300;

/**
 * POST /api/runs/:id/submit { <section key>: text, ... } — sections come from the problem
 *
 * 1. Freeze the submission (submission_finalized).
 * 2. Grade it against the rubric + hidden truth + the user's actual process.
 * 3. Record the grade (evaluation_returned) and let the manager react on Slack.
 *
 * Retry-safe: if step 2 failed last time, the run is left "submitted", and
 * calling this again grades the stored submission instead of failing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Run not found");
    const userId = await getUserId();
    const pool = getPool();
    let run = await getRun(pool, id, userId);
    const bundle = await getBundle(run.problemSlug);
    if (!bundle?.rubric || bundle.problem.type !== "case-study") return jsonError(400, "This problem can't be graded");

    const sections = bundle.problem.deliverable ?? DEFAULT_DELIVERABLE;
    let submission: Submission;
    if (run.status === "submitted") {
      const finalized = run.events.find((e) => e.type === "submission_finalized");
      submission = (finalized as { submission: Submission }).submission;
    } else {
      const parsed = parseSubmission(await readJsonBody(req), sections);
      if (!parsed.ok) return jsonError(400, parsed.error);
      submission = parsed.submission;
      await appendRunEvent(pool, id, userId, {
        type: "submission_finalized",
        at: new Date().toISOString(),
        submission,
      });
      run = await getRun(pool, id, userId);
    }

    const evaluation = await evaluateSubmission({
      provider: getAIProvider(),
      rubric: bundle.rubric,
      truth: bundle.problem.truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER,
      analysis: bundle.analysis,
      submission,
      sections,
      events: run.events,
    });
    await appendRunEvent(pool, id, userId, {
      type: "evaluation_returned",
      at: new Date().toISOString(),
      score: evaluation.score,
      feedback: evaluation,
    });
    await postEvaluationReaction(id, userId, bundle, run.events, evaluation);

    return NextResponse.json({ evaluation });
  } catch (err) {
    return handleRouteError(err);
  }
}
