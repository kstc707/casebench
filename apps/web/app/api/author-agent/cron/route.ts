import { NextResponse } from "next/server";
import { startAuthorJob } from "../../../../lib/authorAgent";
import { handleRouteError, jsonError } from "../../../../lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Called once a day by Vercel Cron (see vercel.json). Vercel sends
 * "Authorization: Bearer $CRON_SECRET"; anything else is refused, so nobody
 * else can spend the AI quota.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return jsonError(503, "Set CRON_SECRET to enable the daily author agent");
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return jsonError(401, "Unauthorized");
    const job = await startAuthorJob({ trigger: "cron", topic: null, requestedBy: null });
    return NextResponse.json({ job: { id: job.id } }, { status: 202 });
  } catch (err) {
    return handleRouteError(err);
  }
}
