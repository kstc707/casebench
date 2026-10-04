import { after, NextResponse } from "next/server";
import { fireDueTriggers } from "../../../../../lib/agents";
import { appendRunEvent, getPool } from "../../../../../lib/db";
import { parseClientEvent } from "../../../../../lib/runEvents";
import { getUserId, isUuid } from "../../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/runs/:id/events { type, ... } — append a client-originated
 * event (viewed the brief, opened a resource, ran a query, saved a draft).
 * 409 if the state machine rejects it (e.g. the run is already submitted).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return jsonError(404, "Run not found");

    const parsed = parseClientEvent(await readJsonBody(req));
    if (!parsed.ok) return jsonError(400, parsed.error);

    const userId = await getUserId();
    const run = await appendRunEvent(getPool(), id, userId, parsed.event);
    // Let the agents react (e.g. "saw you're in the sessions table") after the
    // response is sent, so logging a query never waits on an AI call.
    after(() => fireDueTriggers(id, userId).catch((err) => console.error(err)));
    return NextResponse.json({ run });
  } catch (err) {
    return handleRouteError(err);
  }
}
