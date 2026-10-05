import { NextResponse } from "next/server";
import { requestHint, UnknownChannelError } from "../../../../../lib/agents";
import { getUserId } from "../../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody, runIdFrom } from "../../../../../lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { channel } — "I'm stuck": that coworker gives one stronger hint. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Run not found");
    const body = (await readJsonBody(req)) as { channel?: unknown } | undefined;
    if (typeof body?.channel !== "string") return jsonError(400, "channel must be a string");
    await requestHint(id, await getUserId(), body.channel);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnknownChannelError) return jsonError(400, "Unknown channel");
    return handleRouteError(err);
  }
}
