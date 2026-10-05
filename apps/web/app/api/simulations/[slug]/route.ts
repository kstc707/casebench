import { NextResponse } from "next/server";
import { getPool, listComments, viewerState } from "../../../../lib/db";
import { metaFor } from "../../../../lib/community";
import { getUserId } from "../../../../lib/session";
import { handleRouteError, jsonError } from "../../../../lib/api";

export const dynamic = "force-dynamic";

/** GET /api/simulations/:slug — complexity, solver stats, likes/ratings, comments, and what you've done. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const meta = (await metaFor([slug])).get(slug);
    if (!meta) return jsonError(404, "Simulation not found");
    const userId = await getUserId();
    const pool = getPool();
    const [viewer, comments] = await Promise.all([viewerState(pool, slug, userId), listComments(pool, slug, userId)]);
    return NextResponse.json({ ...meta, viewer, comments });
  } catch (err) {
    return handleRouteError(err);
  }
}
