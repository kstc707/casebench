import { z } from "zod";

/**
 * A "data recipe": the AI describes the tables and the planted real-world
 * effects; this deterministic code produces the rows. The AI never writes
 * the rows itself, so the data is consistent, repeatable (seeded) and
 * guaranteed to contain what the answer key claims, which the quality gate
 * then proves with SQL.
 */

const name = z.string().regex(/^[a-z][a-z0-9_]*$/, "lowercase snake_case").max(40);
const scalar = z.union([z.string().max(200), z.number()]);

export const ColumnSchema = z.discriminatedUnion("kind", [
  /** 1, 2, 3… or "ord_1", "ord_2"… */
  z.object({ name, kind: z.literal("id"), prefix: z.string().max(10).optional() }),
  /** A random id from an earlier table (a foreign key). */
  z.object({ name, kind: z.literal("ref"), table: name, column: name }),
  z.object({
    name,
    kind: z.literal("category"),
    values: z.array(z.string().max(80)).min(1).max(50),
    weights: z.array(z.number().nonnegative()).optional(),
  }),
  /** Uniform between min and max, or normal(mean, sd) clipped to [min, max]. */
  z.object({
    name,
    kind: z.literal("number"),
    min: z.number(),
    max: z.number(),
    mean: z.number().optional(),
    sd: z.number().positive().optional(),
    decimals: z.number().int().min(0).max(4).optional(),
  }),
  /** Uniform between two dates; ISO strings, so comparisons work as text too. */
  z.object({
    name,
    kind: z.literal("date"),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    withTime: z.boolean().optional(),
  }),
  z.object({ name, kind: z.literal("bool"), p: z.number().min(0).max(1) }),
]);

export const ConditionSchema = z.object({
  column: name,
  op: z.enum(["eq", "neq", "in", "gt", "gte", "lt", "lte"]),
  value: z.union([scalar, z.array(scalar).max(50)]),
});

/**
 * Applied in order to the rows matching every `where` condition (and, if
 * `probability` is set, only to that fraction of them). Exactly one action.
 */
export const EffectSchema = z
  .object({
    description: z.string().max(300),
    where: z.array(ConditionSchema).max(5),
    probability: z.number().min(0).max(1).optional(),
    set: z.object({ column: name, value: z.union([scalar, z.boolean()]) }).optional(),
    multiply: z.object({ column: name, factor: z.number() }).optional(),
    add: z.object({ column: name, amount: z.number() }).optional(),
    pick: z.object({ column: name, values: z.array(z.string().max(80)).min(1).max(50), weights: z.array(z.number().nonnegative()).optional() }).optional(),
    /** Emit an exact copy of the row (e.g. events re-sent by a buggy client). */
    duplicate: z.literal(true).optional(),
    /** Remove the row (e.g. data that was never logged). */
    drop: z.literal(true).optional(),
  })
  .refine(
    (e) => [e.set, e.multiply, e.add, e.pick, e.duplicate, e.drop].filter((x) => x !== undefined).length === 1,
    "each effect needs exactly one of: set, multiply, add, pick, duplicate, drop"
  );

export const TableSchema = z.object({
  name,
  description: z.string().max(300),
  rows: z.number().int().min(1).max(20000),
  columns: z.array(ColumnSchema).min(1).max(15),
  effects: z.array(EffectSchema).max(12),
});

export const DataSpecSchema = z.object({
  seed: z.number().int().optional(),
  tables: z.array(TableSchema).min(1).max(6),
});

export type DataSpec = z.infer<typeof DataSpecSchema>;
export type Table = z.infer<typeof TableSchema>;
export type Column = z.infer<typeof ColumnSchema>;
type Value = string | number | boolean | null;
export type Row = Record<string, Value>;

/** Small, fast, seeded PRNG (mulberry32): same seed → same data. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Problems a recipe can have that its schema can't express (unknown columns, bad refs…). */
export function checkSpec(spec: DataSpec): string[] {
  const errors: string[] = [];
  const seen = new Map<string, Set<string>>();
  let cells = 0;
  for (const t of spec.tables) {
    if (seen.has(t.name)) errors.push(`table ${t.name}: duplicate table name`);
    const cols = new Set<string>();
    for (const c of t.columns) {
      if (cols.has(c.name)) errors.push(`table ${t.name}: duplicate column ${c.name}`);
      cols.add(c.name);
      if (c.kind === "ref" && !seen.get(c.table)?.has(c.column)) {
        errors.push(`table ${t.name}.${c.name}: ref to ${c.table}.${c.column}, which must be defined in an earlier table`);
      }
      if (c.kind === "category" && c.weights && c.weights.length !== c.values.length) {
        errors.push(`table ${t.name}.${c.name}: weights and values must have the same length`);
      }
      if (c.kind === "number" && c.min > c.max) errors.push(`table ${t.name}.${c.name}: min > max`);
      if (c.kind === "date" && c.start > c.end) errors.push(`table ${t.name}.${c.name}: start is after end`);
    }
    t.effects.forEach((e, i) => {
      for (const w of e.where) if (!cols.has(w.column)) errors.push(`table ${t.name} effect ${i + 1}: unknown column ${w.column} in where`);
      const target = e.set?.column ?? e.multiply?.column ?? e.add?.column ?? e.pick?.column;
      if (target && !cols.has(target)) errors.push(`table ${t.name} effect ${i + 1}: unknown column ${target}`);
    });
    seen.set(t.name, cols);
    cells += t.rows * t.columns.length;
  }
  if (cells > 400_000) errors.push(`too much data (${cells} cells); keep rows × columns under 400,000 in total`);
  return errors;
}

const DAY = 86_400_000;

function genColumn(c: Column, i: number, rand: () => number, tables: Map<string, Row[]>): Value {
  switch (c.kind) {
    case "id":
      return c.prefix ? `${c.prefix}${i + 1}` : i + 1;
    case "ref": {
      const rows = tables.get(c.table)!;
      return rows.length ? rows[Math.floor(rand() * rows.length)][c.column] : null;
    }
    case "category":
      return weighted(c.values, c.weights, rand);
    case "number": {
      let x: number;
      if (c.mean !== undefined && c.sd !== undefined) {
        // Box–Muller, clipped to the range.
        const u = Math.max(rand(), 1e-12);
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
        x = Math.min(c.max, Math.max(c.min, c.mean + z * c.sd));
      } else {
        x = c.min + rand() * (c.max - c.min);
      }
      return round(x, c.decimals ?? 0);
    }
    case "date": {
      const start = Date.parse(`${c.start}T00:00:00Z`);
      const end = Date.parse(`${c.end}T00:00:00Z`) + DAY - 1;
      const t = start + Math.floor(rand() * (end - start));
      const iso = new Date(c.withTime ? t : Math.floor(t / DAY) * DAY).toISOString();
      return c.withTime ? iso.slice(0, 19).replace("T", " ") : iso.slice(0, 10);
    }
    case "bool":
      return rand() < c.p;
  }
}

function weighted(values: string[], weights: number[] | undefined, rand: () => number): string {
  if (!weights || weights.length !== values.length) return values[Math.floor(rand() * values.length)];
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  let r = rand() * total;
  for (let i = 0; i < values.length; i++) {
    r -= weights[i];
    if (r < 0) return values[i];
  }
  return values[values.length - 1];
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

function matches(row: Row, cond: z.infer<typeof ConditionSchema>): boolean {
  const v = row[cond.column];
  const cmp = (a: Value, b: string | number) =>
    typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  const val = cond.value;
  switch (cond.op) {
    case "eq":
      return String(v) === String(val);
    case "neq":
      return String(v) !== String(val);
    case "in":
      return (Array.isArray(val) ? val : [val]).map(String).includes(String(v));
    case "gt":
      return !Array.isArray(val) && cmp(v, val) > 0;
    case "gte":
      return !Array.isArray(val) && cmp(v, val) >= 0;
    case "lt":
      return !Array.isArray(val) && cmp(v, val) < 0;
    case "lte":
      return !Array.isArray(val) && cmp(v, val) <= 0;
  }
}

/** Build every table from the recipe. Throws on recipe errors (call checkSpec first for readable ones). */
export function generateTables(spec: DataSpec): Map<string, Row[]> {
  const problems = checkSpec(spec);
  if (problems.length) throw new Error(problems.join("; "));
  const rand = rng(spec.seed ?? 42);
  const tables = new Map<string, Row[]>();
  for (const t of spec.tables) {
    let rows: Row[] = [];
    for (let i = 0; i < t.rows; i++) {
      const row: Row = {};
      for (const c of t.columns) row[c.name] = genColumn(c, i, rand, tables);
      rows.push(row);
    }
    const numbers = new Map(t.columns.filter((c) => c.kind === "number").map((c) => [c.name, c.decimals ?? 0]));
    for (const e of t.effects) {
      const out: Row[] = [];
      for (const row of rows) {
        const hit = e.where.every((w) => matches(row, w)) && (e.probability === undefined || rand() < e.probability);
        if (!hit) {
          out.push(row);
          continue;
        }
        if (e.drop) continue;
        out.push(row);
        if (e.duplicate) out.push({ ...row });
        else if (e.set) row[e.set.column] = e.set.value;
        else if (e.pick) row[e.pick.column] = weighted(e.pick.values, e.pick.weights, rand);
        else if (e.multiply && typeof row[e.multiply.column] === "number") {
          row[e.multiply.column] = round((row[e.multiply.column] as number) * e.multiply.factor, numbers.get(e.multiply.column) ?? 2);
        } else if (e.add && typeof row[e.add.column] === "number") {
          row[e.add.column] = round((row[e.add.column] as number) + e.add.amount, numbers.get(e.add.column) ?? 2);
        }
      }
      rows = out;
    }
    tables.set(t.name, rows);
  }
  return tables;
}

/** RFC 4180 CSV. */
export function toCsv(rows: Row[], columns: string[]): string {
  const cell = (v: Value) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

/** The recipe's tables as `{ "orders.csv": "..." }`, ready for a scenario's `data`. */
export function generateCsvFiles(spec: DataSpec): Record<string, string> {
  const tables = generateTables(spec);
  const files: Record<string, string> = {};
  for (const t of spec.tables) files[`${t.name}.csv`] = toCsv(tables.get(t.name)!, t.columns.map((c) => c.name));
  return files;
}
