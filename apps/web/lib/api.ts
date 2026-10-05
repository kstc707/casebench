import "server-only";
import { NextResponse } from "next/server";
import { IllegalTransitionError } from "@casebench/domain";
import { RunNotFoundError } from "@casebench/database";
import { AIRefusalError } from "@casebench/ai";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Maps known domain/database errors to HTTP responses; rethrows the rest. */
export function handleRouteError(err: unknown) {
  if (err instanceof RunNotFoundError) return jsonError(404, "Run not found");
  if (err instanceof IllegalTransitionError) return jsonError(409, err.message);
  if (err instanceof AIRefusalError) return jsonError(502, "The AI declined to respond. Try rephrasing.");
  console.error(err);
  return jsonError(500, "Internal server error");
}

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** Validates the :id route param; every runs route needs this. */
export async function runIdFrom(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params;
  return UUID_RE.test(id) ? id : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
