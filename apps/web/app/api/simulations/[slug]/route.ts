import { NextResponse } from "next/server";
import { authorsOf, recentSolvers } from "@casebench/database";
import { getPool, listComments, viewerState } from "../../../../lib/db";
import { metaFor } from "../../../../lib/community";
import { getProfile, getUserId } from "../../../../lib/session";
import { handleRouteError, jsonError } from "../../../../lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/simulations/:slug — complexity, solver stats, likes/ratings,
 * who made it, who solved it recently, comments, and what you've done.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const meta = (await metaFor([slug])).get(slug);
    if (!meta) return jsonError(404, "Simulation not found");
    const [userId, profile] = await Promise.all([getUserId(), getProfile()]);
    const pool = getPool();
    const [viewer, comments, solvers, authors] = await Promise.all([
      viewerState(pool, slug, userId),
      listComments(pool, slug, userId),
      recentSolvers(pool, slug),
      authorsOf(pool, [slug]),
    ]);
    const author = authors.get(slug);
    return NextResponse.json({
      ...meta,
      author: author ? { handle: author.handle, displayName: author.displayName } : null,
      solvers,
      viewer: { ...viewer, profile: profile && { handle: profile.handle, displayName: profile.displayName } },
      comments,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
