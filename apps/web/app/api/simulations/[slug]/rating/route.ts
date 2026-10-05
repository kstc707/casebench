import { NextResponse } from "next/server";
import { getPool, NotFinishedError, setRating } from "../../../../../lib/db";
import { getBundle } from "../../../../../lib/problems";
import { requireProfile } from "../../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

/** POST { stars: 1–5 } — only after you've finished the simulation. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!(await getBundle(slug))) return jsonError(404, "Simulation not found");
    const body = (await readJsonBody(req)) as { stars?: unknown } | undefined;
    const stars = body?.stars;
    if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
      return jsonError(400, "stars must be a whole number from 1 to 5");
    }
    await setRating(getPool(), slug, (await requireProfile()).id, stars);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFinishedError) return jsonError(403, err.message);
    return handleRouteError(err);
  }
}
