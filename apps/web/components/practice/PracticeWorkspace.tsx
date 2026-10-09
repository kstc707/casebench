"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { getRun, logEvent } from "../api";
import { requireProfile, useProfile } from "../Profile";
import { useTestRunner } from "./useTestRunner";
import type { RunResult, TestResult } from "../../lib/practice/runner";
import type { PracticeTask } from "../../lib/practice/types";

/** Browser-only conveniences (draft code, current attempt). Storage can be missing or throw. */
const store = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // not saved: fine
    }
  },
};

const shortName = (id: string) => id.split("::").slice(1).join("::") || id;

export function PracticeWorkspace({ task }: { task: PracticeTask }) {
  const keys = { files: `cb:practice:${task.slug}:files`, run: `cb:practice:${task.slug}:run` };
  const original = useMemo(() => Object.fromEntries(task.editable.map((f) => [f, task.files[f]])), [task]);
  const [code, setCode] = useState<Record<string, string>>(original);
  const [active, setActive] = useState(task.editable[0]);
  const [runId, setRunId] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dark, setDark] = useState(false);
  const declinedProfile = useRef(false);
  const runner = useTestRunner();
  const me = useProfile();

  const required = useMemo(() => [...task.failToPass, ...task.passToPass], [task]);
  const byId = useMemo(() => new Map((result?.results ?? []).map((r) => [r.id, r])), [result]);

  // Restore a saved draft and the current attempt.
  useEffect(() => {
    const draft = store.get(keys.files);
    if (draft) {
      try {
        const saved = JSON.parse(draft) as Record<string, string>;
        setCode((c) => ({ ...c, ...Object.fromEntries(Object.entries(saved).filter(([f]) => task.editable.includes(f))) }));
      } catch {
        // ignore a corrupt draft
      }
    }
    const id = store.get(keys.run);
    if (id) {
      getRun(id).then(
        (run) => {
          setRunId(run.id);
          if (run.status === "evaluated" || run.status === "published") setSolved(true);
        },
        () => store.set(keys.run, null) // not ours any more (e.g. signed out)
      );
    }
    setDark(window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.slug]);

  // Save the draft as you type.
  useEffect(() => {
    const changed = Object.entries(code).some(([f, c]) => c !== original[f]);
    store.set(keys.files, changed ? JSON.stringify(code) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /** The attempt that records your work; asks for a profile the first time. */
  const ensureRun = useCallback(
    async (mustHave: boolean): Promise<string | null> => {
      if (runId) return runId;
      if (!mustHave && declinedProfile.current) return null;
      const ok = await requireProfile("Create a profile so your attempts and solved tasks are saved under your name.");
      if (!ok) {
        declinedProfile.current = true;
        return null;
      }
      const res = await fetch("/api/practice/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: task.slug }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      const { run } = (await res.json()) as { run: { id: string } };
      setRunId(run.id);
      store.set(keys.run, run.id);
      return run.id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runId, task.slug]
  );

  async function runTests(): Promise<RunResult | null> {
    setMessage(null);
    try {
      const id = await ensureRun(false);
      const r = await runner.run({ ...task.files, ...code }, required);
      setResult(r);
      if (id) {
        const failing = r.results.filter((t) => t.outcome !== "passed").map((t) => t.id);
        void logEvent(id, { type: "tests_run", passed: required.length - failing.length, total: required.length, failing, error: r.error });
      }
      return r;
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
      return null;
    }
  }

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    try {
      const id = await ensureRun(true);
      if (!id) {
        setMessage({ kind: "error", text: "Create a profile to submit, so the solve is saved under your name." });
        return;
      }
      const r = await runTests(); // always check the code being submitted
      if (!r) return;
      if (r.error || r.results.some((t) => t.outcome !== "passed")) {
        setMessage({ kind: "error", text: "Not every required test passes yet. Fix the failing ones, then submit." });
        return;
      }
      const res = await fetch(`/api/practice/runs/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: code, results: r.results }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ kind: "error", text: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setSolved(true);
      store.set(keys.files, null);
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    if (!window.confirm(`Undo all your changes to ${active.split("/").pop()}?`)) return;
    setCode((c) => ({ ...c, [active]: original[active] }));
  }

  const passed = required.filter((id) => byId.get(id)?.outcome === "passed").length;
  const brokenOthers = task.passToPass.filter((id) => byId.has(id) && byId.get(id)!.outcome !== "passed");
  const busy = runner.state !== "ready" || submitting;
  const fileList = [...task.editable, ...task.testFiles, ...Object.keys(task.files).filter((f) => !task.editable.includes(f) && !task.testFiles.includes(f)).sort()];
  const editable = task.editable.includes(active);

  return (
    <div className="practice">
      <section className="practice-side" aria-label="Task">
        <div className="practice-scroll">
          <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>{task.title}</h1>
          <div className="issue-meta" style={{ marginBottom: 14 }}>
            <span className="pill">{task.project.name}</span>
            <a href={task.project.repo} target="_blank" rel="noreferrer">
              Project on GitHub
            </a>
            <span>· {task.project.license} license</span>
          </div>

          {solved && (
            <div className="practice-solved" role="status">
              <strong>Solved.</strong> Every required test passes. Checked in your browser.
              {me && (
                <>
                  {" "}
                  It's on <Link href={`/u/${me.handle}`}>your profile</Link>.
                </>
              )}
            </div>
          )}

          <p style={{ marginTop: 0 }}>
            This is a real bug that was fixed in <strong>{task.project.name}</strong>. You have the code as it was
            before the fix, and the project's own tests.
          </p>
          <p>
            <strong>Your task:</strong> change <code>{task.editable.join(", ")}</code> so the{" "}
            {task.failToPass.length === 1 ? "failing test passes" : `${task.failToPass.length} failing tests pass`}, without
            breaking the {task.passToPass.length} tests that already pass.
          </p>

          {result?.error && (
            <>
              <h2 className="practice-h">pytest couldn't run the tests</h2>
              <pre className="practice-pre">{result.error}</pre>
            </>
          )}

          <h2 className="practice-h">Tests to fix</h2>
          <ul className="practice-tests">
            {task.failToPass.map((id) => (
              <TestRow key={id} id={id} r={byId.get(id)} />
            ))}
          </ul>

          <h2 className="practice-h">Tests to keep passing</h2>
          <p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>
            {!result
              ? `${task.passToPass.length} tests in ${task.testFiles.join(", ")}.`
              : brokenOthers.length === 0
                ? `All ${task.passToPass.length} still pass.`
                : `${brokenOthers.length} of ${task.passToPass.length} now fail: your change broke something.`}
          </p>
          {brokenOthers.length > 0 && (
            <ul className="practice-tests">
              {brokenOthers.slice(0, 10).map((id) => (
                <TestRow key={id} id={id} r={byId.get(id)} />
              ))}
            </ul>
          )}

          <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
            Tip: read the failing test first. It tells you exactly what the code should return.
          </p>
        </div>
      </section>

      <section className="practice-main" aria-label="Code">
        <div className="practice-tabs" role="tablist">
          {fileList.slice(0, task.editable.length + task.testFiles.length).map((f) => (
            <button key={f} role="tab" aria-selected={active === f} className={active === f ? "on" : ""} onClick={() => setActive(f)} title={f}>
              {task.editable.includes(f) ? "✎ " : ""}
              {f.split("/").pop()}
              {code[f] !== undefined && code[f] !== original[f] ? " •" : ""}
            </button>
          ))}
          <select
            aria-label="Other project files"
            value={fileList.indexOf(active) >= task.editable.length + task.testFiles.length ? active : ""}
            onChange={(e) => e.target.value && setActive(e.target.value)}
          >
            <option value="">Other files…</option>
            {fileList.slice(task.editable.length + task.testFiles.length).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="practice-file-bar">
          <span className="muted">{active}</span>
          {editable ? (
            code[active] !== original[active] && (
              <button className="link" onClick={reset}>
                Undo my changes
              </button>
            )
          ) : (
            <span className="pill">read-only</span>
          )}
        </div>
        <div className="practice-editor">
          <CodeMirror
            value={editable ? code[active] : task.files[active]}
            onChange={(v) => editable && setCode((c) => ({ ...c, [active]: v }))}
            extensions={[python()]}
            readOnly={!editable}
            editable={editable}
            theme={dark ? "dark" : "light"}
            height="100%"
            style={{ height: "100%" }}
            aria-label={`Code: ${active}`}
          />
        </div>
        <div className="practice-bar">
          <span className="muted" style={{ fontSize: 13 }} aria-live="polite">
            {runner.state === "loading" && "Starting Python in your browser…"}
            {runner.state === "running" && "Running tests…"}
            {runner.state === "failed" && `Python couldn't start: ${runner.bootError}`}
            {runner.state === "ready" && result && `${passed} of ${required.length} required tests pass (${(result.durationMs / 1000).toFixed(1)} s)`}
            {runner.state === "ready" && !result && "Ready"}
          </span>
          {message && <span className={message.kind === "error" ? "error" : "muted"} style={{ fontSize: 13 }}>{message.text}</span>}
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => void runTests()} disabled={busy}>
              Run tests
            </button>
            <button className="primary" onClick={() => void submit()} disabled={busy || solved}>
              {solved ? "Solved" : submitting ? "Submitting…" : "Submit"}
            </button>
          </span>
        </div>
      </section>
    </div>
  );
}

function TestRow({ id, r }: { id: string; r: TestResult | undefined }) {
  const outcome = r?.outcome;
  const icon = outcome === "passed" ? "✓" : outcome === "failed" || outcome === "missing" ? "✗" : "○";
  return (
    <li className={`practice-test ${outcome ?? "not-run"}`}>
      <span className="practice-test-icon" aria-label={outcome ?? "not run yet"}>
        {icon}
      </span>
      <span style={{ minWidth: 0 }}>
        <code title={id}>{shortName(id)}</code>
        {r?.message && <pre className="practice-pre">{r.message}</pre>}
        {outcome === "missing" && <div className="muted" style={{ fontSize: 13 }}>This test didn't run. Check the error above.</div>}
      </span>
    </li>
  );
}
