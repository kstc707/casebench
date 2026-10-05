import { describe, expect, it } from "vitest";
import { computeComplexity, csvRows } from "./complexity";
import { loadProblemBundle, readDataFile } from "./loadRolePack";
import { starterScenario } from "./starterScenario";
import type { ScenarioBundle } from "./scenarioSchema";

async function official(slug: string) {
  const b = (await loadProblemBundle(slug))!;
  let totalRows = 0;
  for (const f of b.problem.type === "case-study" ? b.problem.dataFiles : []) {
    totalRows += csvRows((await readDataFile(b, f.replace(/^data\//, ""))) ?? "");
  }
  const shape = { problem: b.problem, personas: b.personas, agents: b.agents, rubric: b.rubric! } as ScenarioBundle;
  return { shape, data: { tables: shape.problem.dataFiles.length, totalRows } };
}

describe("complexity score", () => {
  it("stays within 0–10 and labels consistently", async () => {
    const { shape, data } = await official("watch-time-decline");
    const c = computeComplexity(shape, data);
    expect(c.score).toBeGreaterThan(0);
    expect(c.score).toBeLessThanOrEqual(10);
    for (const v of Object.values(c.dimensions)) expect(v).toBeGreaterThanOrEqual(0);
    expect(["Beginner", "Intermediate", "Advanced", "Expert"]).toContain(c.label);
  });

  it("rates the real data case above a blank template", async () => {
    const { shape, data } = await official("watch-time-decline");
    const template = starterScenario("s-00000000", "data-analyst");
    expect(computeComplexity(shape, data).score).toBeGreaterThan(computeComplexity(template).score);
  });

  it("treats data work as more technical than a writing-only case", async () => {
    const { shape, data } = await official("watch-time-decline");
    const ux = await official("trial-signup-dropoff");
    const noData = { ...shape, problem: { ...shape.problem, dataFiles: [] } };
    expect(computeComplexity(shape, data).dimensions.technical).toBeGreaterThan(computeComplexity(noData, { tables: 0, totalRows: 0 }).dimensions.technical);
    expect(computeComplexity(ux.shape, ux.data).dimensions.technical).toBeLessThan(computeComplexity(shape, data).dimensions.technical);
  });

  it("ignores solver results until 5 people finish, then lets them pull the score", async () => {
    const { shape, data } = await official("watch-time-decline");
    const base = computeComplexity(shape, data).score;
    expect(computeComplexity(shape, data, { attempts: 10, completions: 4, avgScore: 10, avgMinutes: 90 }).score).toBe(base);

    const brutal = computeComplexity(shape, data, { attempts: 100, completions: 40, avgScore: 30, avgMinutes: 110 });
    const easy = computeComplexity(shape, data, { attempts: 40, completions: 40, avgScore: 95, avgMinutes: 20 });
    expect(brutal.score).toBeGreaterThan(base);
    expect(easy.score).toBeLessThan(base);
    expect(brutal.observedWeight).toBeGreaterThan(0);
    expect(brutal.expectedMinutes).toBe(110);
    expect(brutal.minutesFromSolvers).toBe(true);
    const instant = computeComplexity(shape, data, { attempts: 10, completions: 10, avgScore: 50, avgMinutes: 0 });
    expect(instant).toMatchObject({ expectedMinutes: 90, minutesFromSolvers: false });
  });

  it("counts CSV rows without the header", () => {
    expect(csvRows("a,b\n1,2\n3,4\n")).toBe(2);
    expect(csvRows("a,b\n")).toBe(0);
  });
});
