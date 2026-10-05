import { describe, expect, it } from "vitest";
import { checkSpec, DataSpecSchema, generateCsvFiles, generateTables, toCsv, type DataSpec } from "./dataSpec";

/** A small version of the watch-time case: a buggy app version re-sends events after a release. */
const spec: DataSpec = {
  seed: 7,
  tables: [
    {
      name: "users",
      description: "accounts",
      rows: 200,
      columns: [
        { name: "user_id", kind: "id", prefix: "u" },
        { name: "plan", kind: "category", values: ["basic", "premium"], weights: [3, 1] },
      ],
      effects: [],
    },
    {
      name: "sessions",
      description: "play events",
      rows: 2000,
      columns: [
        { name: "session_id", kind: "id" },
        { name: "user_id", kind: "ref", table: "users", column: "user_id" },
        { name: "app_version", kind: "category", values: ["5.2.0", "5.3.0"] },
        { name: "started_at", kind: "date", start: "2026-07-01", end: "2026-08-31", withTime: true },
        { name: "minutes", kind: "number", min: 1, max: 120, mean: 40, sd: 15 },
      ],
      effects: [
        { description: "5.3.0 re-sends events after the release", where: [{ column: "app_version", op: "eq", value: "5.3.0" }, { column: "started_at", op: "gte", value: "2026-08-03" }], probability: 0.5, duplicate: true },
        { description: "lost logging", where: [{ column: "minutes", op: "gt", value: 115 }], drop: true },
        { description: "short sessions on mobile", where: [{ column: "app_version", op: "eq", value: "5.3.0" }], multiply: { column: "minutes", factor: 0.5 } },
      ],
    },
  ],
};

describe("data recipe", () => {
  it("is deterministic: same seed, same data", () => {
    expect(generateCsvFiles(spec)).toEqual(generateCsvFiles(spec));
    expect(generateCsvFiles({ ...spec, seed: 8 })).not.toEqual(generateCsvFiles(spec));
  });

  it("plants the effects it describes", () => {
    const t = generateTables(spec);
    const sessions = t.get("sessions")!;
    const ids = sessions.map((s) => s.session_id);
    const dupes = ids.length - new Set(ids).size;
    expect(dupes).toBeGreaterThan(100); // re-sent events exist…
    const dupRows = sessions.filter((s, i) => ids.indexOf(s.session_id) !== i);
    expect(dupRows.every((s) => s.app_version === "5.3.0" && String(s.started_at) >= "2026-08-03")).toBe(true); // …only where planted
    expect(sessions.every((s) => (s.minutes as number) <= 115)).toBe(true); // dropped
    const users = new Set(t.get("users")!.map((u) => u.user_id));
    expect(sessions.every((s) => users.has(s.user_id as string))).toBe(true); // refs point at real rows
  });

  it("explains recipe mistakes instead of crashing", () => {
    const bad: DataSpec = {
      tables: [
        {
          name: "orders",
          description: "",
          rows: 10,
          columns: [{ name: "customer_id", kind: "ref", table: "customers", column: "id" }],
          effects: [{ description: "", where: [{ column: "nope", op: "eq", value: 1 }], drop: true }],
        },
      ],
    };
    expect(checkSpec(bad)).toEqual([
      "table orders.customer_id: ref to customers.id, which must be defined in an earlier table",
      "table orders effect 1: unknown column nope in where",
    ]);
    expect(DataSpecSchema.safeParse({ tables: [{ ...spec.tables[0], effects: [{ description: "", where: [], drop: true, duplicate: true }] }] }).success).toBe(false);
  });

  it("writes valid CSV", () => {
    expect(toCsv([{ a: 'say "hi", ok', b: null, c: 3 }], ["a", "b", "c"])).toBe('a,b,c\n"say ""hi"", ok",,3\n');
  });
});
