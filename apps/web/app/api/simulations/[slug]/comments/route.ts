import { NextResponse } from "next/server";
import { addComment, deleteComment, getPool } from "../../../../../lib/db";
import { getBundle } from "../../../../../lib/problems";
import { getUserId, isUuid } from "../../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

/** POST { name, body } — comment on a simulation (plain text, max 2000 chars). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!(await getBundle(slug))) return jsonError(404, "Simulation not found");
    const b = (await readJsonBody(req)) as { name?: unknown; body?: unknown } | undefined;
    const name = typeof b?.name === "string" ? b.name.trim().slice(0, 60) : "";
    const text = typeof b?.body === "string" ? b.body.trim() : "";
    if (!name) return jsonError(400, "Add a display name");
    if (!text || text.length > 2000) return jsonError(400, "Comments must be 1–2000 characters");
    await addComment(getPool(), slug, await getUserId(), name, text);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** DELETE ?id=… — delete your own comment. */
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!isUuid(id)) return jsonError(404, "Comment not found");
    const ok = await deleteComment(getPool(), id, await getUserId());
    return ok ? NextResponse.json({ ok: true }) : jsonError(404, "Comment not found");
  } catch (err) {
    return handleRouteError(err);
  }
}
