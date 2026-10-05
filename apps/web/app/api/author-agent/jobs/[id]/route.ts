import { NextResponse } from "next/server";
import { decideAuthorJob } from "@casebench/database";
import { getPool } from "../../../../../lib/db";
import { getProfile } from "../../../../../lib/session";
import { isAdmin } from "../../../../../lib/authorAgent";
import { handleRouteError, jsonError, readJsonBody, runIdFrom } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

/** POST { decision: "approve" | "reject" } — publish the draft as CB, or delete it. Admins only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isAdmin(await getProfile())) return jsonError(403, "Admins only");
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Job not found");
    const b = (await readJsonBody(req)) as { decision?: unknown } | undefined;
    if (b?.decision !== "approve" && b?.decision !== "reject") return jsonError(400, 'decision must be "approve" or "reject"');
    const job = await decideAuthorJob(getPool(), id, b.decision === "approve");
    return job ? NextResponse.json({ job }) : jsonError(409, "Only a finished draft can be approved or rejected, once");
  } catch (err) {
    return handleRouteError(err);
  }
}
