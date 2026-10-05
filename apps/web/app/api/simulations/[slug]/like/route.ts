import { NextResponse } from "next/server";
import { getPool, setLike } from "../../../../../lib/db";
import { getBundle } from "../../../../../lib/problems";
import { requireProfile } from "../../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

/** POST { liked: boolean } — like or unlike. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!(await getBundle(slug))) return jsonError(404, "Simulation not found");
    const body = (await readJsonBody(req)) as { liked?: unknown } | undefined;
    if (typeof body?.liked !== "boolean") return jsonError(400, "liked must be true or false");
    await setLike(getPool(), slug, (await requireProfile()).id, body.liked);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
