import { describe, expect, it } from "vitest";
import { bundleFromScenario, listAllProblems, loadProblemBundle, readDataFile, toClientSafe, toPublicPersona } from "./loadRolePack";
import { validateScenario } from "./scenarioSchema";
import { starterScenario } from "./starterScenario";

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

describe("every scenario in content/ is valid", () => {
  it("passes the same schema the Studio and import script use", async () => {
    const problems = await listAllProblems();
    for (const p of problems.filter((x) => x.type === "case-study")) {
      const b = (await loadProblemBundle(p.slug))!;
      const result = validateScenario({ problem: b.problem, personas: b.personas, agents: b.agents, rubric: b.rubric });
      expect(result.ok ? [] : result.errors, p.slug).toEqual([]);
    }
  });

  it("rejects a scenario with broken references, with readable errors", () => {
    const result = validateScenario({
      problem: { type: "case-study", slug: "x", role: "ux-designer", company: "acme", title: "T", difficulty: "easy", estimatedMinutes: 30, concepts: [], brief: "b", resources: [], dataFiles: ["data/a.csv"], truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER: "answer" },
      personas: [{ id: "pm", name: "P", title: "PM", company: "Acme", role: "colleague", tone: "t", avatarColor: "#123456", offlineReply: "r" }],
      agents: { agents: [{ personaId: "ghost", knowledge: ["k"], hintLevels: [], mustNot: [] }], triggers: [], leakGuards: [] },
      rubric: { problemSlug: "y", scale: { min: 0, max: 4 }, criteria: [{ key: "c", label: "C", description: "d", weight: 1, weak: "w", strong: "s" }] },
      data: {},
    });
    expect(result.ok).toBe(false);
    const errors = (result as { errors: string[] }).errors.join("\n");
    expect(errors).toMatch(/exactly one coworker must be the manager/);
    expect(errors).toMatch(/no coworker with id "ghost"/);
    expect(errors).toMatch(/must match the problem slug/);
    expect(errors).toMatch(/missing contents for a.csv/);
  });

  it("serves inline CSVs for Studio scenarios, only when listed", async () => {
    const b = (await loadProblemBundle("watch-time-decline"))!;
    const inline = bundleFromScenario({
      problem: { ...b.problem, dataFiles: ["data/orders.csv"] } as never,
      personas: b.personas, agents: b.agents, rubric: b.rubric!,
      data: { "orders.csv": "id\n1\n" },
    });
    expect(await readDataFile(inline, "orders.csv")).toBe("id\n1\n");
    expect(await readDataFile(inline, "users.csv")).toBeNull();
  });
});

describe("Studio starter template", () => {
  it("is a valid, playable scenario for every role", () => {
    for (const role of ["data-analyst", "ux-designer", "product-manager", "marketing-analyst"]) {
      const result = validateScenario(starterScenario("s-1234abcd", role, "My case"));
      expect(result.ok ? [] : result.errors, role).toEqual([]);
    }
  });
});

describe("kickoff messages", () => {
  it("only point people to channels that exist", async () => {
    for (const p of (await listAllProblems()).filter((x) => x.type === "case-study")) {
      const b = (await loadProblemBundle(p.slug))!;
      const channel = (b.problem as { channel?: string }).channel ?? p.slug;
      for (const t of b.agents.triggers) {
        for (const m of (t.text ?? "").matchAll(/#([a-z0-9-]+)/g)) expect(m[1], `${p.slug}/${t.id}`).toBe(channel);
      }
    }
  });
});
