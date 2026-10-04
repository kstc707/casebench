import { describe, expect, it } from "vitest";
import { listAllProblems, loadProblemBundle, readDataFile, toClientSafe, toPublicPersona } from "./loadRolePack";

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

describe("problem bundle", () => {
  it("loads personas, agents, rubric, and measured facts for the case study", async () => {
    const bundle = await loadProblemBundle("watch-time-decline");
    expect(bundle).not.toBeNull();
    expect(bundle!.personas.map((p) => p.id)).toEqual(["priya", "sam"]);
    expect(bundle!.agents.triggers.length).toBeGreaterThan(0);
    expect(bundle!.rubric?.criteria.length).toBeGreaterThan(0);
    expect(bundle!.analysis).toBeTruthy();
  });

  it("every agent and trigger refers to a persona that exists", async () => {
    const bundle = (await loadProblemBundle("watch-time-decline"))!;
    const ids = new Set(bundle.personas.map((p) => p.id));
    for (const a of bundle.agents.agents) expect(ids.has(a.personaId)).toBe(true);
    for (const t of bundle.agents.triggers) {
      expect(ids.has(t.personaId), t.id).toBe(true);
      expect(t.text ?? t.prompt, `${t.id} needs text or prompt`).toBeTruthy();
    }
    for (const g of bundle.agents.leakGuards) {
      expect(g.personaId === "*" || ids.has(g.personaId)).toBe(true);
      expect(() => new RegExp(g.pattern)).not.toThrow();
    }
  });

  it("serves only listed CSVs — never server-only files or path tricks", async () => {
    const bundle = (await loadProblemBundle("watch-time-decline"))!;
    expect(await readDataFile(bundle, "users.csv")).toContain("user_id");
    for (const name of ["analysis.json", "agents.json", "rubric.json", "simulation.json", "../simulation.json", "..%2Fanalysis.json"]) {
      expect(await readDataFile(bundle, name), name).toBeNull();
    }
  });

  it("public personas carry no prompts, models, or knowledge", async () => {
    const bundle = (await loadProblemBundle("watch-time-decline"))!;
    const json = JSON.stringify(bundle.personas.map(toPublicPersona));
    expect(json).not.toMatch(/tone|model|knowledge|offlineReply/);
  });
});
