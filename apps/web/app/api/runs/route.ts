import { NextResponse } from "next/server";
import { getPool, insertRun, listRuns } from "../../../lib/db";
import { getProblemBySlug } from "../../../lib/problems";
import { getUserId } from "../../../lib/session";
import { fireDueTriggers } from "../../../lib/agents";
import { handleRouteError, jsonError, readJsonBody } from "../../../lib/api";

export const dynamic = "force-dynamic";

/** GET /api/runs[?problemSlug=...] — the current user's runs, newest first. */
export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    const problemSlug = new URL(req.url).searchParams.get("problemSlug") ?? undefined;
    const runs = await listRuns(getPool(), userId, problemSlug);
    return NextResponse.json({ runs });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** POST /api/runs { problemSlug } — start a new run. */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as { problemSlug?: unknown } | undefined;
    if (typeof body?.problemSlug !== "string") {
      return jsonError(400, "problemSlug must be a string");
    }
    const problem = await getProblemBySlug(body.problemSlug);
    if (!problem) return jsonError(404, "Problem not found");

    const userId = await getUserId();
    const run = await insertRun(getPool(), problem.slug, userId);
    // The manager's kickoff message is waiting the moment the workspace opens.
    await fireDueTriggers(run.id, userId);
    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
