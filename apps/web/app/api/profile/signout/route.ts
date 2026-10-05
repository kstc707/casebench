import { NextResponse } from "next/server";
import { signOut } from "../../../../lib/session";
import { handleRouteError } from "../../../../lib/api";

export const dynamic = "force-dynamic";

/** POST — sign out on this device (you can sign back in with your profile key). */
export async function POST() {
  try {
    await signOut();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
