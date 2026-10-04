import { NextResponse } from "next/server";
import type { ScoredEvaluation, Submission } from "@casebench/agents";
import { getPool, getRun, publishRun } from "../../../../../lib/db";
import { getProblemBySlug } from "../../../../../lib/problems";
import { getUserId } from "../../../../../lib/session";
import { handleRouteError, jsonError, runIdFrom } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/runs/:id/publish — freeze a graded run and create its public
 * portfolio page. The summary is assembled from the real record (no AI), so
 * it can't overstate what happened.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Run not found");
    const userId = await getUserId();
    const pool = getPool();
    const run = await getRun(pool, id, userId);
    if (run.status !== "evaluated") return jsonError(409, "Only graded runs can be published");

    const problem = await getProblemBySlug(run.problemSlug);
    const evaluation = run.events.find((e) => e.type === "evaluation_returned");
    const finalized = run.events.find((e) => e.type === "submission_finalized");
    const feedback = (evaluation as { feedback: ScoredEvaluation }).feedback;
    const submission = (finalized as { submission: Submission }).submission;

    const queries = run.events.filter((e) => e.type === "query_run").length;
    const messages = run.events.filter((e) => e.type === "message_sent").length;
    const firstSentence = submission.executiveSummary.split(/(?<=[.!?])\s/)[0].slice(0, 300);
    const summary = [
      `${problem?.title ?? run.problemSlug} — scored ${feedback.score}/100${feedback.gradedBy === "ai" ? "" : " (offline grader)"}.`,
      `Finding: ${firstSentence}`,
      `Process: ${queries} SQL queries, ${messages} messages with coworkers.`,
    ].join(" ");

    await publishRun(pool, id, userId, summary, feedback.score);
    return NextResponse.json({ url: `/portfolio/${id}` });
  } catch (err) {
    return handleRouteError(err);
  }
}
