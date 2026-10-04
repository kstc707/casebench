"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRun, latestRun, logEvent, startRun } from "./api";
import type { TableInfo } from "./duckdb";
import { SqlConsole } from "./SqlConsole";
import { Avatar, SlackPanel } from "./SlackPanel";
import { WriteUp } from "./WriteUp";
import { Feedback } from "./Feedback";
import type { ClientSafeCaseStudy, PublicPersona, RunDetail, ScoredEvaluation, Submission } from "./types";

type CenterTab = "sql" | "writeup" | "feedback";

/**
 * The simulated workday: brief + data on the left, SQL and the write-up in
 * the middle, Slack with AI coworkers on the right. All state lives on the
 * server as the run's event log; this component just renders it.
 */
export function Workspace({
  problem,
  personas,
  labels,
}: {
  problem: ClientSafeCaseStudy;
  personas: PublicPersona[];
  labels: Record<string, string>;
}) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<CenterTab>("sql");
  const [leftTab, setLeftTab] = useState<"brief" | "data">("brief");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [nudge, setNudge] = useState(0);
  const [insertSql, setInsertSql] = useState<{ sql: string; n: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    latestRun(problem.slug)
      .then((r) => {
        setRun(r);
        if (r?.events.some((e) => e.type === "evaluation_returned")) setTab("feedback");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [problem.slug]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function start() {
    setError(null);
    try {
      setRun(await startRun(problem.slug));
      setTab("sql");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshRun() {
    if (run) setRun(await getRun(run.id));
  }

  if (!loaded) return <main className="page muted">Loading…</main>;

  if (!run || run.status === "published") {
    return (
      <main className="page">
        <Link href="/">← All problems</Link>
        <h1>{problem.title}</h1>
        <p>{problem.brief}</p>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <strong>You'll be working with</strong>
          {personas.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Avatar persona={p} /> {p.name} <span className="muted">· {p.title}</span>
            </div>
          ))}
          <p className="muted" style={{ margin: 0 }}>
            They're AI coworkers. They message you on Slack, notice what you're working on, and answer
            questions — but they won't do the analysis for you.
          </p>
        </div>
        {run?.status === "published" && (
          <p>
            Your last attempt is published: <Link href={`/portfolio/${run.id}`}>view it</Link>.
          </p>
        )}
        <button className="primary" onClick={start} style={{ marginTop: 16 }}>
          {run ? "Start a new attempt" : "Start this problem"}
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const startedAt = Date.parse(run.events[0]?.at ?? new Date().toISOString());
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000));
  const evaluation = (run.events.find((e) => e.type === "evaluation_returned") as { feedback: ScoredEvaluation } | undefined)?.feedback;
  const finalized = run.events.find((e) => e.type === "submission_finalized") as { submission: Submission } | undefined;
  const lastDraft = [...run.events].reverse().find((e) => e.type === "submission_drafted") as { draft: Submission } | undefined;
  const bump = () => setNudge((n) => n + 1);

  return (
    <>
      <header className="ws-header">
        <Link href="/">Casebench</Link>
        <h1>{problem.title}</h1>
        <span className="pill">{run.status.replace("_", " ")}</span>
        <span className="muted" style={{ marginLeft: "auto" }}>{minutes} min in</span>
      </header>
      <div className="ws-grid">
        <aside className="ws-col">
          <div className="tabs">
            <button className={leftTab === "brief" ? "active" : ""} onClick={() => setLeftTab("brief")}>Brief</button>
            <button className={leftTab === "data" ? "active" : ""} onClick={() => setLeftTab("data")}>Tables</button>
          </div>
          {leftTab === "brief" ? (
            <div className="section">
              <h3>The ask</h3>
              <p>{problem.brief}</p>
              <h3>Resources</h3>
              {problem.resources.map((r) => (
                <details
                  key={r.title}
                  className="resource"
                  onToggle={(e) => {
                    if ((e.target as HTMLDetailsElement).open) {
                      void logEvent(run.id, { type: "resource_opened", resourceTitle: r.title });
                      bump();
                    }
                  }}
                >
                  <summary>{r.title}</summary>
                  <pre>{r.content}</pre>
                </details>
              ))}
              <h3>Concepts you'll practice</h3>
              <ul style={{ paddingLeft: 18 }}>
                {problem.concepts.map((c) => (
                  <li key={c.name}><strong>{c.name}</strong> — <span className="muted">{c.blurb}</span></li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="section">
              {tables.length === 0 && <p className="muted">Tables load with the SQL engine…</p>}
              {tables.map((t) => (
                <details key={t.name} className="resource">
                  <summary>
                    <strong>{t.name}</strong> <span className="muted">· {t.rows.toLocaleString()} rows</span>
                  </summary>
                  <div style={{ padding: "0 10px 10px" }}>
                    {t.columns.map((c) => (
                      <div key={c.name} className="mono">{c.name} <span className="muted">{c.type.toLowerCase()}</span></div>
                    ))}
                    <button
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        setTab("sql");
                        setInsertSql({ sql: `SELECT * FROM ${t.name} LIMIT 20;`, n: Date.now() });
                      }}
                    >
                      Preview
                    </button>{" "}
                    <a href={`/api/problems/${problem.slug}/data/${t.name}.csv`} download>Download CSV</a>
                  </div>
                </details>
              ))}
            </div>
          )}
        </aside>

        <section className="ws-center">
          <div className="tabs">
            <button className={tab === "sql" ? "active" : ""} onClick={() => setTab("sql")}>SQL</button>
            <button className={tab === "writeup" ? "active" : ""} onClick={() => setTab("writeup")}>Write-up</button>
            {evaluation && (
              <button className={tab === "feedback" ? "active" : ""} onClick={() => setTab("feedback")}>Feedback</button>
            )}
          </div>
          {/* The console stays mounted so the loaded tables survive tab switches. */}
          <div style={{ display: tab === "sql" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <SqlConsole
              runId={run.id}
              problemSlug={problem.slug}
              dataFiles={problem.dataFiles}
              onTables={setTables}
              onQueryLogged={bump}
              insertSql={insertSql}
            />
          </div>
          {tab === "writeup" && (
            <WriteUp
              runId={run.id}
              initial={finalized?.submission ?? lastDraft?.draft ?? null}
              locked={!!finalized}
              onActivity={bump}
              onSubmitted={async () => {
                await refreshRun();
                setTab("feedback");
                bump();
              }}
            />
          )}
          {tab === "feedback" && evaluation && (
            <Feedback runId={run.id} evaluation={evaluation} labels={labels} published={false} />
          )}
        </section>

        <aside className="ws-col" style={{ borderRight: "none" }}>
          <SlackPanel runId={run.id} personas={personas} nudge={nudge} />
        </aside>
      </div>
    </>
  );
}
