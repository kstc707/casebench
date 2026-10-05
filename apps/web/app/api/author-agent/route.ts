import { NextResponse } from "next/server";
import { listAuthorJobs } from "@casebench/database";
import { getPool } from "../../../lib/db";
import { getProfile } from "../../../lib/session";
import { isAdmin, startAuthorJob } from "../../../lib/authorAgent";
import { handleRouteError, jsonError, readJsonBody } from "../../../lib/api";

export const dynamic = "force-dynamic";
// The agent runs in the background of this request (research + several model calls).
export const maxDuration = 300;

async function admin() {
  const me = await getProfile();
  return isAdmin(me) ? me : null;
}

/** GET — the review queue: recent agent runs with their drafts, sources, checks and logs. Admins only. */
export async function GET() {
  try {
    if (!(await admin())) return jsonError(403, "Admins only (set CASEBENCH_ADMINS to your profile handle).");
    return NextResponse.json({ jobs: await listAuthorJobs(getPool()) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** POST { topic? } — run the agent now. Admins only. */
export async function POST(req: Request) {
  try {
    const me = await admin();
    if (!me) return jsonError(403, "Admins only (set CASEBENCH_ADMINS to your profile handle).");
    const b = (await readJsonBody(req)) as { topic?: unknown } | undefined;
    const topic = typeof b?.topic === "string" && b.topic.trim() ? b.topic.trim().slice(0, 300) : null;
    const job = await startAuthorJob({ trigger: "manual", topic, requestedBy: me.id });
    return NextResponse.json({ job }, { status: 202 });
  } catch (err) {
    return handleRouteError(err);
  }
}
