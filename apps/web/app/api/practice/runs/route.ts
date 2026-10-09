import { NextResponse } from "next/server";
import { getPool, insertRun } from "../../../../lib/db";
import { getPracticeTask } from "../../../../lib/practice/tasks";
import { PRACTICE_RUN_PREFIX } from "../../../../lib/practice/types";
import { requireProfile } from "../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody } from "../../../../lib/api";

export const dynamic = "force-dynamic";

/** POST /api/practice/runs { slug } — start a practice attempt, recorded under your profile. */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as { slug?: unknown } | undefined;
    if (typeof body?.slug !== "string") return jsonError(400, "slug must be a string");
    const task = await getPracticeTask(body.slug);
    if (!task) return jsonError(404, "Practice task not found");
    const userId = (await requireProfile()).id;
    const run = await insertRun(getPool(), PRACTICE_RUN_PREFIX + task.slug, userId);
    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
