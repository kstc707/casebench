import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "cb_uid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Anonymous identity until a real account system exists (see roadmap): a
 * random id in an httpOnly cookie, created on first use. Runs are scoped to
 * it, so a browser only ever sees its own runs. Swapping in real auth means
 * replacing this one function.
 *
 * Only call from route handlers or server actions — those are the only
 * places Next.js allows setting cookies.
 */
export async function getUserId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing && isUuid(existing)) return existing;

  const id = randomUUID();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
