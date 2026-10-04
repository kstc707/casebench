import "server-only";
import { NextResponse } from "next/server";
import { IllegalTransitionError } from "@casebench/domain";
import { RunNotFoundError } from "@casebench/database";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Maps known domain/database errors to HTTP responses; rethrows the rest. */
export function handleRouteError(err: unknown) {
  if (err instanceof RunNotFoundError) return jsonError(404, "Run not found");
  if (err instanceof IllegalTransitionError) return jsonError(409, err.message);
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
