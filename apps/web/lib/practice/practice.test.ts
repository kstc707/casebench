import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendEvent, createRun } from "@casebench/domain";
import { parseClientEvent } from "../runEvents";
import { parsePracticeSubmission } from "./submission";
import type { PracticeTask } from "./types";

const task: PracticeTask = {
  slug: "demo-abc1234",
  title: "Fix a bug",
  project: { name: "demo", repo: "https://github.com/x/demo", license: "MIT", upstreamPullRequest: 1 },
  baseCommit: "a",
  fixCommit: "b",
  language: "python",
  fixSize: 3,
  editable: ["src/demo/core.py"],
  testFiles: ["tests/test_core.py"],
  failToPass: ["tests/test_core.py::test_bug"],
  passToPass: ["tests/test_core.py::test_ok"],
  files: { "src/demo/core.py": "x = 1\n", "tests/test_core.py": "" },
};

const passing = [
  { id: "tests/test_core.py::test_bug", outcome: "passed" },
  { id: "tests/test_core.py::test_ok", outcome: "passed" },
];

describe("practice submissions", () => {
  it("accepts a fix when every required test passes", () => {
    const r = parsePracticeSubmission({ files: { "src/demo/core.py": "x = 2\n" }, results: passing }, task);
    expect(r).toMatchObject({ ok: true, submission: { testsPassed: 2, testsTotal: 2, checkedIn: "browser" } });
  });

  it("refuses failing, missing or broken tests (422), naming them", () => {
    const failing = parsePracticeSubmission({ files: { "src/demo/core.py": "" }, results: [passing[0]] }, task);
    expect(failing).toMatchObject({ ok: false, status: 422, failing: ["tests/test_core.py::test_ok"] });
    const broken = parsePracticeSubmission(
      { files: { "src/demo/core.py": "" }, results: [passing[0], { id: passing[1].id, outcome: "failed" }] },
      task
    );
    expect(broken).toMatchObject({ ok: false, status: 422 });
  });

  it("only takes files the task lets you edit", () => {
    expect(parsePracticeSubmission({ files: { "tests/test_core.py": "def test_bug(): pass" }, results: passing }, task)).toMatchObject({
      ok: false,
      status: 400,
      error: expect.stringContaining("isn't a file you can change"),
    });
    expect(parsePracticeSubmission({ files: {}, results: passing }, task)).toMatchObject({ ok: false, status: 400 });
    expect(parsePracticeSubmission({ files: { "src/demo/core.py": "x".repeat(200_001) }, results: passing }, task)).toMatchObject({
      ok: false,
      error: expect.stringContaining("too large"),
    });
  });
});

describe("tests_run events", () => {
  it("are validated and capped", () => {
    const ok = parseClientEvent({ type: "tests_run", passed: 1, total: 3, failing: Array.from({ length: 50 }, (_, i) => `t${i}`), error: null });
    expect(ok.ok && ok.event.type === "tests_run" && ok.event.failing.length).toBe(20);
    expect(parseClientEvent({ type: "tests_run", passed: 4, total: 3, failing: [] }).ok).toBe(false);
    expect(parseClientEvent({ type: "tests_run", passed: 1, total: 3, failing: [1] }).ok).toBe(false);
  });

  it("move a run in progress, and keep it there", () => {
    let run = createRun("practice:demo-abc1234", "u");
    const tests = { type: "tests_run" as const, at: "", passed: 0, total: 2, failing: [], error: null };
    run = appendEvent(run, tests);
    run = appendEvent(run, tests);
    expect(run.status).toBe("in_progress");
  });
});

describe("practice content", () => {
  const root = path.resolve(__dirname, "../../../../content/practice");
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".json"));

  it("has tasks", () => expect(files.length).toBeGreaterThan(0));

  it.each(files)("%s is a complete task", (f) => {
    const t = JSON.parse(readFileSync(path.join(root, f), "utf8")) as PracticeTask;
    expect(t.slug).toBe(path.basename(f, ".json"));
    expect(t.failToPass.length).toBeGreaterThan(0);
    for (const e of t.editable) expect(t.files[e], `${e} is in files`).toBeTypeOf("string");
    for (const id of [...t.failToPass, ...t.passToPass]) expect(t.testFiles).toContain(id.split("::")[0]);
    expect(new Set([...t.failToPass, ...t.passToPass]).size).toBe(t.failToPass.length + t.passToPass.length);
  });
});
