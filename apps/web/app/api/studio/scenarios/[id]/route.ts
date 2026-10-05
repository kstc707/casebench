import { NextResponse } from "next/server";
import { deleteScenario, getPool, getScenarioForAuthor, ScenarioNotFoundError, updateScenario } from "../../../../../lib/db";
import { getUserId, getProfile } from "../../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody, runIdFrom } from "../../../../../lib/api";
import { validateForSlug } from "../../../../../lib/studio";

export const dynamic = "force-dynamic";

function handle(err: unknown) {
  if (err instanceof ScenarioNotFoundError) return jsonError(404, "Scenario not found");
  return handleRouteError(err);
}

/** GET — the full scenario, including the answer key. Author only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Scenario not found");
    const s = await getScenarioForAuthor(getPool(), id, await getUserId());
    return NextResponse.json({ scenario: s });
  } catch (err) {
    return handle(err);
  }
}

/**
 * PUT { bundle } — save. Rejected with readable errors (422) if
 * the scenario isn't valid, so a saved scenario is always playable.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Scenario not found");
    const userId = await getUserId();
    const current = await getScenarioForAuthor(getPool(), id, userId);
    const body = (await readJsonBody(req)) as { bundle?: unknown } | undefined;
    const v = validateForSlug(body?.bundle, current.slug);
    if (!v.ok) return NextResponse.json({ error: "Fix these before saving", errors: v.errors }, { status: 422 });
    // Shown as "by <name>": always the profile's current name.
    const authorName = (await getProfile())?.displayName;
    const saved = await updateScenario(getPool(), { id, authorId: userId, bundle: v.bundle, authorName });
    return NextResponse.json({ scenario: saved });
  } catch (err) {
    return handle(err);
  }
}

/** PATCH { listed } — show or hide in the Community section. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Scenario not found");
    const body = (await readJsonBody(req)) as { listed?: unknown } | undefined;
    if (typeof body?.listed !== "boolean") return jsonError(400, "listed must be true or false");
    const saved = await updateScenario(getPool(), { id, authorId: await getUserId(), listed: body.listed });
    return NextResponse.json({ scenario: saved });
  } catch (err) {
    return handle(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await runIdFrom(params);
    if (!id) return jsonError(404, "Scenario not found");
    await deleteScenario(getPool(), id, await getUserId());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handle(err);
  }
}
