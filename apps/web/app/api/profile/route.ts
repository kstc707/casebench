import { NextResponse } from "next/server";
import { renameUser } from "@casebench/database";
import { getPool } from "../../../lib/db";
import { createProfile, getProfile, requireProfile } from "../../../lib/session";
import { handleRouteError, jsonError, readJsonBody } from "../../../lib/api";

export const dynamic = "force-dynamic";

const nameFrom = (b: unknown) => {
  const name = (b as { name?: unknown } | undefined)?.name;
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
};

/** GET — who you are: { profile: { handle, displayName } | null }. */
export async function GET() {
  try {
    const p = await getProfile();
    return NextResponse.json({ profile: p && { handle: p.handle, displayName: p.displayName } });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * POST { name } — create a profile for this browser. Everything you did as a
 * guest moves to it. Returns the profile key once: it's how you sign in on
 * another device (we only store its hash).
 */
export async function POST(req: Request) {
  try {
    if (await getProfile()) return jsonError(409, "You already have a profile on this browser");
    const name = nameFrom(await readJsonBody(req));
    if (name.length < 2) return jsonError(400, "Pick a name with at least 2 characters");
    const { user, key } = await createProfile(name);
    return NextResponse.json({ profile: { handle: user.handle, displayName: user.displayName }, key }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** PATCH { name } — change your display name (your @handle stays). */
export async function PATCH(req: Request) {
  try {
    const me = await requireProfile();
    const name = nameFrom(await readJsonBody(req));
    if (name.length < 2) return jsonError(400, "Pick a name with at least 2 characters");
    const u = await renameUser(getPool(), me.id, name);
    return NextResponse.json({ profile: u && { handle: u.handle, displayName: u.displayName } });
  } catch (err) {
    return handleRouteError(err);
  }
}
