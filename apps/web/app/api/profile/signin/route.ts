import { NextResponse } from "next/server";
import { signIn } from "../../../../lib/session";
import { handleRouteError, jsonError, readJsonBody } from "../../../../lib/api";

export const dynamic = "force-dynamic";

/** POST { handle, key } — sign in to your profile on this device. */
export async function POST(req: Request) {
  try {
    const b = (await readJsonBody(req)) as { handle?: unknown; key?: unknown } | undefined;
    if (typeof b?.handle !== "string" || typeof b?.key !== "string") return jsonError(400, "handle and key are required");
    const user = await signIn(b.handle.slice(0, 60), b.key.slice(0, 40));
    if (!user) return jsonError(401, "That name and profile key don't match");
    return NextResponse.json({ profile: { handle: user.handle, displayName: user.displayName } });
  } catch (err) {
    return handleRouteError(err);
  }
}
