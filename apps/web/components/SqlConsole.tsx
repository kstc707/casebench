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
  onTables,
  onQueryLogged,
  insertSql,
}: {
  runId: string;
  problemSlug: string;
  dataFiles: string[];
  onTables: (t: TableInfo[]) => void;
  onQueryLogged: () => void;
  insertSql: { sql: string; n: number } | null;
}) {
  const [sql, setSql] = useState(STARTER_SQL);
  const [loading, setLoading] = useState<string | null>("Loading the data engine…");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTables(problemSlug, dataFiles)
      .then((t) => {
        onTables(t);
        setLoading(null);
      })
      .catch((e: Error) => setLoading(`Couldn't load the data: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemSlug]);

  useEffect(() => {
    if (insertSql) setSql(insertSql.sql);
  }, [insertSql]);

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
    <>
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
    </>
  );
}
