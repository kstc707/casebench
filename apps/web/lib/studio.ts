import "server-only";
import { validateScenario, type ScenarioBundle } from "@casebench/simulation-engine";

/**
 * Studio scenarios always use the slug the server assigned: authors can't
 * claim an official slug or another author's. Applied before validation.
 */
export function pinSlug(input: unknown, slug: string): unknown {
  if (typeof input !== "object" || input === null) return input;
  const b = structuredClone(input) as { problem?: Record<string, unknown>; rubric?: Record<string, unknown> };
  if (b.problem && typeof b.problem === "object") b.problem.slug = slug;
  if (b.rubric && typeof b.rubric === "object") b.rubric.problemSlug = slug;
  return b;
}

export function validateForSlug(input: unknown, slug: string) {
  return validateScenario(pinSlug(input, slug));
}

export type { ScenarioBundle };
