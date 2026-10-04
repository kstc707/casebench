import { describe, expect, it } from "vitest";
import { listAllProblems, toClientSafe } from "./loadRolePack";

/**
 * The hidden truth model must never reach the client
 * (docs/concept-brief.md § 4b). Verified here by serializing exactly what
 * the app sends and searching it, not by trusting the type system alone.
 */
describe("truth-model isolation", () => {
  it("finds the bundled content", async () => {
    const problems = await listAllProblems();
    expect(problems.length).toBeGreaterThan(0);
  });

  it("strips the truth model from every client-safe problem", async () => {
    const problems = await listAllProblems();
    for (const problem of problems) {
      const serialized = JSON.stringify(toClientSafe(problem));
      expect(serialized).not.toContain("truthModel");

      if (problem.type === "case-study") {
        const truth = problem.truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER as Record<string, unknown>;
        expect(truth, `${problem.slug} has no truth model`).toBeTruthy();
        // Check the truth's string values too, in case it was copied under a different key.
        for (const value of Object.values(truth)) {
          if (typeof value === "string" && value.length > 20) {
            expect(serialized).not.toContain(value);
          }
        }
      }
    }
  });
});
