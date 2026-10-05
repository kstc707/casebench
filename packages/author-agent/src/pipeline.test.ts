import { describe, expect, it } from "vitest";
import type { AIProvider } from "@casebench/ai";
import { starterScenario } from "@casebench/simulation-engine";
import { runAuthorAgent, type Check, type CheckResult, type Design } from "./pipeline";
import type { DataSpec } from "./dataSpec";

const dataSpec: DataSpec = {
  seed: 3,
  tables: [
    {
      name: "logins",
      description: "one row per login attempt",
      rows: 1500,
      columns: [
        { name: "login_id", kind: "id" },
        { name: "country", kind: "category", values: ["US", "IN", "DE", "BR"] },
        { name: "success", kind: "bool", p: 0.9 },
        { name: "attempted_at", kind: "date", start: "2026-09-01", end: "2026-09-14", withTime: true },
      ],
      effects: [
        { description: "credential stuffing burst", where: [{ column: "attempted_at", op: "gte", value: "2026-09-10" }, { column: "country", op: "eq", value: "BR" }], probability: 0.6, set: { column: "success", value: false } },
      ],
    },
  ],
};

function design(overrides: (s: Record<string, any>) => void = () => {}): Design {
  const scenario = starterScenario("ignored", "cybersecurity", "Why are logins failing in one country?") as unknown as Record<string, any>;
  delete scenario.data;
  scenario.problem.truthModel_INTERNAL_DO_NOT_EXPOSE_TO_USER = { rootCause: "credential stuffing from BR since Sep 10" };
  scenario.agents.leakGuards = [{ personaId: "*", pattern: "credential stuffing", unlessUserSaid: "stuffing", replacement: "What does the data say?" }];
  overrides(scenario);
  return {
    scenario,
    dataSpec,
    checks: [
      { description: "BR failure rate jumps after Sep 10", sql: "select true as ok" },
      { description: "other countries unchanged", sql: "select true as ok" },
    ],
  };
}

/** Checks "prove" the effect only on data that has it: like a good SQL check would. */
const discriminating = async (spec: DataSpec, _t: Map<string, any[]>, checks: Check[]): Promise<CheckResult[]> =>
  checks.map((c) => ({ ...c, ok: spec.tables.some((t) => t.effects.length > 0) }));

const oneSource = async () => [{ title: "Postmortem", url: "https://blog.example.com/a", text: "x".repeat(400), via: "hackernews" as const }];

/** Plays the model: plan, brief, then the designs in order. */
function fakeProvider(designs: Design[], seen: string[], extra: unknown[] = []): AIProvider {
  const plan = { role: "cybersecurity", theme: "credential stuffing", angle: "failed logins from one region", queries: ["credential stuffing postmortem"] };
  const brief = {
    pattern: "Attackers replay leaked passwords",
    realExamples: [{ summary: "real", url: "https://blog.example.com/a" }, { summary: "made up", url: "https://invented.example.com" }],
    rootCauses: ["credential stuffing"],
    signalsInData: ["failure spike from one country"],
    redHerrings: ["a password policy change"],
    whyItsHard: "looks like a bug",
  };
  const replies: unknown[] = [plan, ...extra, brief, ...designs];
  return {
    kind: "openai-compatible",
    complete: async () => "",
    completeStructured: async (req: { user: string; schema: { parse: (v: unknown) => unknown } }) => {
      seen.push(req.user);
      return req.schema.parse(replies.shift()) as never;
    },
  } as unknown as AIProvider;
}

describe("author agent pipeline", () => {
  it("researches, designs, fails the quality gate, repairs, and returns a valid draft", async () => {
    const seen: string[] = [];
    const twoManagers = design((s) => (s.personas[1].role = "manager"));
    const runs: Check[][] = [];
    const runChecks = async (spec: DataSpec, tables: Map<string, any[]>, checks: Check[]): Promise<CheckResult[]> => {
      runs.push(checks);
      expect(tables.get("logins")!.length).toBe(1500);
      return discriminating(spec, tables, checks);
    };
    const log: string[] = [];
    const result = await runAuthorAgent({
      provider: fakeProvider([twoManagers, design()], seen),
      slug: "s-test1234",
      runChecks,
      research: oneSource,
      log: (l) => log.push(l),
    });

    expect(result.repairs).toBe(1);
    expect(seen.at(-1)).toContain("exactly one coworker must be the manager"); // the error went back to the model
    expect(runs).toHaveLength(2); // only once the schema is valid: on the data, then on the no-effects baseline
    expect(result.checks.every((c) => c.ok && c.baselineOk === false)).toBe(true);
    expect(result.bundle.problem.slug).toBe("s-test1234");
    expect(result.bundle.rubric.problemSlug).toBe("s-test1234");
    expect(result.bundle.problem.dataFiles).toEqual(["data/logins.csv"]);
    expect(result.bundle.data!["logins.csv"].split("\n")[0]).toBe("login_id,country,success,attempted_at");
    expect(result.bundle.problem.resources.at(-1)!.title).toBe("Data dictionary");
    expect(result.brief.realExamples.map((e) => e.url)).toEqual(["https://blog.example.com/a"]); // invented citation dropped
    expect(log.join("\n")).toContain("Quality gate passed");
  });

  it("rejects checks that pass even without the planted effect, and give-away columns", async () => {
    const seen: string[] = [];
    const trivial = async (_s: DataSpec, _t: Map<string, any[]>, checks: Check[]) => checks.map((c) => ({ ...c, ok: true }));
    const giveaway = design();
    giveaway.dataSpec = structuredClone(dataSpec);
    giveaway.dataSpec.tables[0].columns.push({ name: "is_fraud", kind: "bool", p: 0.1 });
    await expect(
      runAuthorAgent({ provider: fakeProvider([giveaway, design()], seen), slug: "s-x", runChecks: trivial, maxRepairs: 1, research: oneSource })
    ).rejects.toMatchObject({ details: [expect.stringContaining("none of the checks proves")] });
    expect(seen[3]).toContain("labels the answer"); // the give-away column was sent back first
  });

  it("rejects a brief that gives the answer away", async () => {
    const seen: string[] = [];
    const leaky = design((s) => (s.problem.brief = "We think it's credential stuffing. Confirm it."));
    await runAuthorAgent({ provider: fakeProvider([leaky, design()], seen), slug: "s-x", runChecks: discriminating, research: oneSource });
    expect(seen.at(-1)).toContain("gives away the answer");
  });

  it("re-plans the search once, and refuses to write anything without relevant sources", async () => {
    const searches: string[][] = [];
    const nothing = async (q: string[]) => (searches.push(q), []);
    await expect(
      runAuthorAgent({ provider: fakeProvider([], [], [{ queries: ["broader words"] }]), slug: "s-x", runChecks: discriminating, research: nothing })
    ).rejects.toThrow(/no relevant real-world sources/);
    expect(searches).toEqual([["credential stuffing postmortem"], ["broader words"]]);
  });

  it("gives up with the reasons when checks keep failing", async () => {
    const failing = async (_s: DataSpec, _t: Map<string, any[]>, checks: Check[]) => checks.map((c) => ({ ...c, ok: false }));
    await expect(
      runAuthorAgent({
        provider: fakeProvider([design(), design()], []),
        slug: "s-x",
        runChecks: failing,
        maxRepairs: 1,
        research: oneSource,
      })
    ).rejects.toMatchObject({ name: "AuthorAgentError", details: expect.arrayContaining([expect.stringContaining("BR failure rate")]) });
  });

  it("refuses to run in offline mode", async () => {
    await expect(
      runAuthorAgent({ provider: { kind: "mock" } as AIProvider, slug: "s-x", runChecks: async () => [] })
    ).rejects.toThrow(/real AI provider/);
  });
});
