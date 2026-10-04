import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createScenario, getPool, listMyScenarios } from "../../../../lib/db";
import { getUserId } from "../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody } from "../../../../lib/api";
import { starterScenario } from "@casebench/simulation-engine";
import { validateForSlug } from "../../../../lib/studio";
import { STUDIO_SLUG_PREFIX } from "../../../../lib/problems";

export const dynamic = "force-dynamic";

/** GET /api/studio/scenarios — scenarios you've authored. */
export async function GET() {
  try {
    const userId = await getUserId();
    const scenarios = (await listMyScenarios(getPool(), userId)).map((s) => ({
      id: s.id,
      slug: s.slug,
      title: (s.bundle as { problem?: { title?: string } }).problem?.title ?? "Untitled",
      role: (s.bundle as { problem?: { role?: string } }).problem?.role ?? "",
      listed: s.listed,
      updatedAt: s.updatedAt,
    }));
    return NextResponse.json({ scenarios });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * POST /api/studio/scenarios — create a scenario.
 *   { role, title }   → from the starter template
 *   { import: {...} } → from an exported scenario JSON (validated)
 */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as { role?: unknown; title?: unknown; import?: unknown; authorName?: unknown } | undefined;
    const id = randomUUID();
    const slug = `${STUDIO_SLUG_PREFIX}${id.slice(0, 8)}`;

    let bundle: unknown;
    if (body?.import !== undefined) {
      const v = validateForSlug(body.import, slug);
      if (!v.ok) return NextResponse.json({ error: "This file isn't a valid scenario", errors: v.errors }, { status: 422 });
      bundle = v.bundle;
    } else {
      const role = typeof body?.role === "string" && /^[a-z0-9-]{2,40}$/.test(body.role) ? body.role : "data-analyst";
      bundle = starterScenario(slug, role, typeof body?.title === "string" ? body.title.slice(0, 120) : undefined);
    }
    const authorName = typeof body?.authorName === "string" ? body.authorName.trim().slice(0, 60) || null : null;
    const userId = await getUserId();
    const created = await createScenario(getPool(), { id, slug, authorId: userId, authorName, bundle });
    return NextResponse.json({ id: created.id, slug: created.slug }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
