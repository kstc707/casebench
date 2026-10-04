import { NextResponse } from "next/server";
import { getPool, getRun } from "../../../../lib/db";
import { getUserId, isUuid } from "../../../../lib/session";
import { handleRouteError, jsonError } from "../../../../lib/api";

export const dynamic = "force-dynamic";

/** GET /api/runs/:id — a run with its full event log (owner only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return jsonError(404, "Run not found");
    const userId = await getUserId();
    const run = await getRun(getPool(), id, userId);
    return NextResponse.json({ run });
  } catch (err) {
    return handleRouteError(err);
  }
}
