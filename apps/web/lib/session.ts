import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createUser, getUser, mergeGuestInto, verifyProfileKey, type User } from "@casebench/database";
import { getPool } from "./db";

/**
 * Who is making a request.
 *
 * - **Guest:** a random id in an httpOnly cookie (`cb_uid`), created on first use.
 * - **Profile:** someone picked a name. A signed cookie (`cb_session`) carries
 *   the profile id. No email or password (this is a demo); a profile key lets
 *   people sign in on another device.
 *
 * Everything (runs, Studio scenarios, likes, ratings, comments) is keyed by
 * this one id. Creating a profile reuses the guest id, and signing in moves
 * a guest's rows over, so nothing done before signing up is lost.
 *
 * Cookie-setting functions only work in route handlers / server actions.
 */

const GUEST_COOKIE = "cb_uid";
const SESSION_COOKIE = "cb_session";
const SESSION_DAYS = 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ---- Signed session cookie: "<userId>.<expiresAtSeconds>.<hmac>" ----
// Signed so that knowing someone's id (it isn't secret) doesn't let you
// become them; guest ids stay unguessable random bearer tokens as before.

let fallbackSecret: string | undefined;

/**
 * AUTH_SECRET if set; otherwise derived from DATABASE_URL, which is already
 * a secret that grants everything, so there's one less value to configure.
 * (Rotating the database password then signs everyone out; they sign back
 * in with their profile key.)
 */
function secret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.DATABASE_URL) {
    return createHash("sha256").update(`casebench-session|${process.env.DATABASE_URL}`).digest("hex");
  }
  return (fallbackSecret ??= randomBytes(32).toString("hex"));
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(userId: string, now = Date.now()): string {
  const payload = `${userId}.${Math.floor(now / 1000) + SESSION_DAYS * 86400}`;
  return `${payload}.${sign(payload)}`;
}

/** The profile id in a valid, unexpired session cookie, else null. */
export function decodeSession(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || !isUuid(parts[0])) return null;
  const [userId, exp, mac] = parts;
  const expected = Buffer.from(sign(`${userId}.${exp}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Number(exp) * 1000 > now ? userId : null;
}

const cookieOpts = (maxAgeSeconds: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSeconds,
});

// ---- Who is asking ----

export async function getUserId(): Promise<string> {
  const store = await cookies();
  const profile = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (profile) return profile;

  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing && isUuid(existing)) return existing;

  const id = randomUUID();
  store.set(GUEST_COOKIE, id, cookieOpts(365 * 86400));
  return id;
}

/** The signed-in profile, or null for guests. Read-only, so server components may call it. */
export async function getProfile(): Promise<User | null> {
  const store = await cookies();
  const id = decodeSession(store.get(SESSION_COOKIE)?.value);
  return id ? getUser(getPool(), id) : null;
}

export class ProfileRequiredError extends Error {
  constructor() {
    super("Pick a name first: create a profile to do that");
    this.name = "ProfileRequiredError";
  }
}

/** For actions recorded under a person (starting, creating, liking, rating, commenting). */
export async function requireProfile(): Promise<User> {
  const user = await getProfile();
  if (!user) throw new ProfileRequiredError();
  return user;
}

// ---- Creating a profile and signing in/out ----

/** This browser becomes a named profile; its guest history comes along. */
export async function createProfile(displayName: string): Promise<{ user: User; key: string }> {
  const store = await cookies();
  const guest = store.get(GUEST_COOKIE)?.value;
  const pool = getPool();
  const reuse = guest && isUuid(guest) && !(await getUser(pool, guest));
  const created = await createUser(pool, { id: reuse ? guest : randomUUID(), displayName });
  store.set(SESSION_COOKIE, encodeSession(created.user.id), cookieOpts(SESSION_DAYS * 86400));
  store.delete(GUEST_COOKIE);
  return created;
}

/** Sign in on another device with handle + profile key. */
export async function signIn(handle: string, key: string): Promise<User | null> {
  const pool = getPool();
  const user = await verifyProfileKey(pool, handle, key);
  if (!user) return null;
  const store = await cookies();
  const guest = store.get(GUEST_COOKIE)?.value;
  if (guest && isUuid(guest) && !(await getUser(pool, guest))) await mergeGuestInto(pool, guest, user.id);
  store.set(SESSION_COOKIE, encodeSession(user.id), cookieOpts(SESSION_DAYS * 86400));
  store.delete(GUEST_COOKIE);
  return user;
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(GUEST_COOKIE);
}
