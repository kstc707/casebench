import { NextResponse } from "next/server";
import { FeedbackRateLimitError, FeedbackValidationError, listFeedback, parseFeedback, submitFeedback, summarizeFeedback } from "@casebench/database";
import { getPool } from "../../../lib/db";
import { getProfile, getUserId } from "../../../lib/session";
import { isAdmin } from "../../../lib/authorAgent";
import { handleRouteError, jsonError, readJsonBody } from "../../../lib/api";

export const dynamic = "force-dynamic";

/** POST — send feedback. Anyone, guest or profile. */
export async function POST(req: Request) {
  try {
    const input = parseFeedback(await readJsonBody(req));
    const row = await submitFeedback(getPool(), await getUserId(), input);
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    if (err instanceof FeedbackValidationError) return jsonError(400, err.message);
    if (err instanceof FeedbackRateLimitError) return jsonError(429, err.message);
    return handleRouteError(err);
  }
}

/** GET — every response plus totals. Admins only. */
export async function GET() {
  try {
    if (!isAdmin(await getProfile())) return jsonError(403, "Admins only.");
    const rows = await listFeedback(getPool());
    return NextResponse.json({ summary: summarizeFeedback(rows), responses: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
