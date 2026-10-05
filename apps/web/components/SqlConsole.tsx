"use client";

import { useEffect, useState } from "react";
import { loadTables, runQuery, type QueryResult, type TableInfo } from "./duckdb";
import { logEvent } from "./api";

const STARTER_SQL = `-- SQL runs in your browser (DuckDB). Ctrl/Cmd+Enter to run.
SELECT date_trunc('week', started_at) AS week,
       COUNT(DISTINCT user_id)       AS active_users,
       SUM(minutes_watched)          AS minutes
FROM sessions
GROUP BY 1
ORDER BY 1;`;

/**
 * The SQL sandbox. Every query is logged to the run's event log
 * (query_run) — that's what lets the AI coworkers see how the work is going,
 * and what the grader checks claims against.
 */
export function SqlConsole({
  runId,
  problemSlug,
  dataFiles,
  onQueryLogged,
}: {
  runId: string;
  problemSlug: string;
  dataFiles: string[];
  onQueryLogged: () => void;
}) {
  const [sql, setSql] = useState(STARTER_SQL);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState<string | null>("Loading the data engine…");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTables(problemSlug, dataFiles)
      .then((t) => {
        setTables(t);
        setLoading(null);
      })
      .catch((e: Error) => setLoading(`Couldn't load the data: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemSlug]);

  async function run() {
    if (running || loading) return;
    setRunning(true);
    setError(null);
    try {
      const r = await runQuery(sql);
      setResult(r);
      await logEvent(runId, { type: "query_run", sql, rowCount: r.rowCount, error: null });
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      setResult(null);
      await logEvent(runId, { type: "query_run", sql, rowCount: null, error: message });
    } finally {
      setRunning(false);
      onQueryLogged();
    }
  }

  return (
    <div className="sql-layout">
      <aside className="schema" aria-label="Tables">
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", margin: "2px 4px 8px" }}>
          Tables
        </div>
        {tables.length === 0 && <p className="muted">Loading…</p>}
        {tables.map((t) => (
          <details key={t.name}>
            <summary>
              <span className="mono">{t.name}</span> <span className="muted">{t.rows.toLocaleString()}</span>
            </summary>
            {t.columns.map((c) => (
              <div key={c.name} className="col mono">
                {c.name} <span className="muted">{c.type.toLowerCase()}</span>
              </div>
            ))}
            <div className="col" style={{ margin: "4px 0 8px" }}>
              <a href="#" onClick={(e) => { e.preventDefault(); setSql(`SELECT * FROM ${t.name} LIMIT 20;`); }}>Preview</a>
              {" · "}
              <a href={`/api/problems/${problemSlug}/data/${t.name}.csv`} download>CSV</a>
            </div>
          </details>
        ))}
      </aside>
      <div className="sql-main">
      <div className="sql-editor">
        <textarea
          aria-label="SQL query"
          className="mono"
          value={sql}
          spellCheck={false}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void run();
            }
          }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="primary" onClick={run} disabled={running || !!loading}>
            {running ? "Running…" : "Run query"}
          </button>
          {loading && <span className="muted">{loading}</span>}
          {result && (
            <span className="muted">
              {result.rowCount.toLocaleString()} rows · {result.ms} ms
              {result.rowCount > result.rows.length && ` · showing first ${result.rows.length}`}
            </span>
          )}
        </div>
      </div>
      <div className="sql-results">
        {error && <pre className="error">{error}</pre>}
        {result && (
          <table className="grid">
            <thead>
              <tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>{row.map((v, j) => <td key={j}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>
    </div>
  );
}
