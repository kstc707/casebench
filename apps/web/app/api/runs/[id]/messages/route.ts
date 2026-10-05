import { NextResponse } from "next/server";
import { fireDueTriggers, replyToUser, UnknownChannelError } from "../../../../../lib/agents";
import { getPool, getRun } from "../../../../../lib/db";
import { getUserId } from "../../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody, runIdFrom } from "../../../../../lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 2_000;

async function chatState(runId: string, userId: string) {
  const run = await getRun(getPool(), runId, userId);
  const messages = run.events.flatMap((e) => {
    if (e.type === "message_sent") return [{ from: "you", channel: e.channel, text: e.text, at: e.at }];
    if (e.type === "message_received") return [{ from: e.channel, channel: e.channel, text: e.text, at: e.at }];
    return [];
  });
  return { status: run.status, messages };
}

/**
 * GET /api/runs/:id/messages — the Slack history. The browser polls this
 * every few seconds; each poll also gives the agents a chance to speak up
 * (time-based triggers like "you've gone quiet" need a clock tick).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Run not found");
    const userId = await getUserId();
    await fireDueTriggers(id, userId);
    return NextResponse.json(await chatState(id, userId));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** POST /api/runs/:id/messages { channel, text } — message an agent and get its reply. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Run not found");
    const body = (await readJsonBody(req)) as { channel?: unknown; text?: unknown } | undefined;
    if (typeof body?.channel !== "string") return jsonError(400, "channel must be a string");
    if (typeof body.text !== "string" || !body.text.trim()) return jsonError(400, "text must be a non-empty string");
    if (body.text.length > MAX_MESSAGE_LENGTH) return jsonError(400, `text must be at most ${MAX_MESSAGE_LENGTH} characters`);

    const userId = await getUserId();
    await replyToUser(id, userId, body.channel, body.text.trim());
    return NextResponse.json(await chatState(id, userId));
  } catch (err) {
    if (err instanceof UnknownChannelError) return jsonError(400, "Unknown channel");
    return handleRouteError(err);
  }
}
