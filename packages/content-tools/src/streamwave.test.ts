import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLUMNS, generateStreamwave, type Dataset } from "./streamwave";
import { parseCsv, toCsv } from "./csv";
import { analyzeStreamwave, dedupeSessions } from "./analyzeStreamwave";

const SIM_DIR = path.resolve(
  __dirname,
  "../../../content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline"
);
const read = (t: string) => readFileSync(path.join(SIM_DIR, "data", `${t}.csv`), "utf-8");

/**
 * The truth model is only worth anything if it's actually true in the data
 * the user downloads. These tests read the committed CSVs and check every
 * claim the truth model makes.
 */
describe("StreamWave watch-time-decline dataset", () => {
  const analysis = analyzeStreamwave({
    users: parseCsv(read("users")),
    sessions: parseCsv(read("sessions")),
    experiments: parseCsv(read("experiments")),
  });

  it("committed CSVs are exactly what the seeded generator produces", () => {
    const data = generateStreamwave();
    for (const table of Object.keys(COLUMNS) as (keyof Dataset)[]) {
      expect(read(table), `${table}.csv is stale — re-run generate:streamwave`).toBe(
        toCsv(COLUMNS[table], data[table])
      );
    }
  });

  it("committed analysis.json matches the data", () => {
    const committed = JSON.parse(readFileSync(path.join(SIM_DIR, "analysis.json"), "utf-8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(analysis)));
  });

  it("shows a large raw decline (the headline in the brief)", () => {
    expect(analysis.changePct.rawAllUsers).toBeLessThan(-18);
  });

  it("duplicates are mobile-only and (almost) all before the Aug 3 fix", () => {
    expect(analysis.duplicates.duplicateRows).toBeGreaterThan(800);
    expect(analysis.duplicates.nonMobile).toBe(0);
    // A real dataset has the odd coincidental collision; the bug itself stops on Aug 3.
    expect(analysis.duplicates.afterFixDate).toBeLessThanOrEqual(2);
  });

  it("deduplicating removes a big part of the decline (measurement artifact)", () => {
    const artifactPoints = analysis.changePct.dedupedAllUsers - analysis.changePct.rawAllUsers;
    expect(artifactPoints).toBeGreaterThan(5);
  });

  it("existing users in the control arm are roughly flat", () => {
    expect(Math.abs(analysis.changePct.dedupedExistingControl)).toBeLessThan(3);
  });

  it("campaign users are a meaningful, low-engagement share of actives", () => {
    expect(analysis.campaign.shareOfActiveUsersWeeks5to8Pct).toBeGreaterThan(10);
    expect(analysis.campaign.minutesPerActiveUserWeeks5to8).toBeLessThan(
      analysis.campaign.existingUsersMinutesPerActiveUserWeeks5to8 * 0.5
    );
  });

  it("the autoplay experiment has a real but modest TV effect", () => {
    const { tvMinutesPerSessionControl: c, tvMinutesPerSessionTreatment: t } = analysis.experiment;
    expect(t).toBeLessThan(c * 0.9);
    expect(t).toBeGreaterThan(c * 0.7);
    expect(analysis.changePct.dedupedExistingTreatment).toBeLessThan(analysis.changePct.dedupedExistingControl - 4);
  });
});

describe("dedupeSessions", () => {
  const ev = (id: string, t: string, content = "c1") => ({
    session_id: id, user_id: "u1", content_id: content, device: "mobile", started_at: t, minutes_watched: "10",
  });

  it("collapses a chain of re-sends to the first event", () => {
    const kept = dedupeSessions([
      ev("1", "2026-08-01T10:00:00Z"),
      ev("2", "2026-08-01T10:01:30Z"),
      ev("3", "2026-08-01T10:03:00Z"), // 90s after #2 (dropped) — still a re-send
    ]);
    expect(kept.map((k) => k.session_id)).toEqual(["1"]);
  });

  it("keeps events just outside the window and on different content", () => {
    const kept = dedupeSessions([
      ev("1", "2026-08-01T10:00:00Z"),
      ev("2", "2026-08-01T10:02:01Z"),
      ev("3", "2026-08-01T10:02:05Z", "c2"),
    ]);
    expect(kept.map((k) => k.session_id)).toEqual(["1", "2", "3"]);
  });
});
