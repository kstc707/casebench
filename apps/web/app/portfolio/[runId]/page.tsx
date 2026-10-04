import { notFound } from "next/navigation";
import type { ScoredEvaluation, Submission } from "@casebench/agents";
import { getPool, getPublishedRun } from "../../../lib/db";
import { getProblemBySlug, getPublicPersonas, getRubricLabels } from "../../../lib/problems";
import { EvaluationView } from "../../../components/Feedback";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public, shareable record of one published run: the write-up, the grade,
 * and the process (queries and the Slack conversation). Built only from the
 * frozen event log, so it shows exactly what happened.
 */
export default async function PortfolioPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!UUID_RE.test(runId)) return notFound();
  const published = await getPublishedRun(getPool(), runId);
  if (!published) return notFound();

  const { run, portfolio } = published;
  const problem = await getProblemBySlug(run.problemSlug);
  const personas = await getPublicPersonas(run.problemSlug);
  const labels = await getRubricLabels(run.problemSlug);
  const evaluation = (run.events.find((e) => e.type === "evaluation_returned") as { feedback: ScoredEvaluation }).feedback;
  const submission = (run.events.find((e) => e.type === "submission_finalized") as { submission: Submission }).submission;
  const queries = run.events.flatMap((e) => (e.type === "query_run" ? [e] : []));
  const chat = run.events.flatMap((e) =>
    e.type === "message_sent" || e.type === "message_received" ? [e] : []
  );
  const start = Date.parse(run.events[0].at);
  const end = Date.parse(run.events.find((e) => e.type === "submission_finalized")!.at);
  const name = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  return (
    <main className="page" style={{ display: "grid", gap: 16 }}>
      <div>
        <p className="muted" style={{ margin: 0 }}>Casebench work simulation · {problem?.role}</p>
        <h1 style={{ margin: "4px 0" }}>{problem?.title}</h1>
        <p>{portfolio.summary}</p>
        <p className="muted">
          {Math.round((end - start) / 60_000)} minutes · {queries.length} SQL queries · {chat.filter((m) => m.type === "message_sent").length} messages
          to AI coworkers · published {new Date(portfolio.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>The write-up</h2>
        {(["executiveSummary", "evidence", "caveats", "recommendation"] as const).map((k) => (
          <div key={k}>
            <h3 className="muted" style={{ fontSize: 13, textTransform: "uppercase" }}>{k.replace(/([A-Z])/g, " $1")}</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{submission[k] || "—"}</p>
          </div>
        ))}
      </div>

      <EvaluationView evaluation={evaluation} labels={labels} />

      <details className="card">
        <summary><strong>Process: every query, in order ({queries.length})</strong></summary>
        <ol>
          {queries.map((q, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{q.sql}</pre>
              <span className="muted">{q.error ? `error: ${q.error}` : `${q.rowCount} rows`}</span>
            </li>
          ))}
        </ol>
      </details>

      <details className="card">
        <summary><strong>Slack with AI coworkers ({chat.length} messages)</strong></summary>
        {chat.map((m, i) => (
          <p key={i}>
            <strong>{m.type === "message_sent" ? "Analyst" : name(m.channel)}</strong>
            {m.type === "message_sent" && <span className="muted"> → {name(m.channel)}</span>}: {m.text}
          </p>
        ))}
      </details>
    </main>
  );
}
