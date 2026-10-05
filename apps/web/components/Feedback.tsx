"use client";

import { useState } from "react";
import { publish } from "./api";
import type { ScoredEvaluation } from "./types";

export function Feedback({
  runId,
  evaluation,
  labels,
  published,
}: {
  runId: string;
  evaluation: ScoredEvaluation;
  labels: Record<string, string>;
  published: boolean;
}) {
  const [url, setUrl] = useState<string | null>(published ? `/portfolio/${runId}` : null);
  const [error, setError] = useState<string | null>(null);

  async function onPublish() {
    try {
      setUrl((await publish(runId)).url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="writeup">
      <EvaluationView evaluation={evaluation} labels={labels} />
      <div className="card">
        {url ? (
          <p style={{ margin: 0 }}>
            Published: <a href={url}>{url}</a> — share this link with recruiters.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="primary" onClick={onPublish}>Publish to portfolio</button>
            <span className="muted">Creates a public page with your write-up, grade, and process. The run is frozen after this.</span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export function EvaluationView({ evaluation, labels }: { evaluation: ScoredEvaluation; labels: Record<string, string> }) {
  return (
    <>
      <div className="card">
        <div className="score-big">{evaluation.score}<span className="muted" style={{ fontSize: 18 }}>/100</span></div>
        {evaluation.gradedBy !== "ai" && <p className="pill">Offline grader — keyword checks only</p>}
        <p>{evaluation.overallFeedback}</p>
      </div>
      <div className="card">
        {evaluation.criteria.map((c) => (
          <div key={c.key} className="criterion">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{labels[c.key] ?? c.key}</strong>
              <span>{c.score}/4</span>
            </div>
            <div className="bar"><div style={{ width: `${(c.score / 4) * 100}%` }} /></div>
            <p className="muted" style={{ margin: "6px 0 0" }}>{c.justification}</p>
          </div>
        ))}
      </div>
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <strong>What went well</strong>
        <ul style={{ margin: 0 }}>{evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <strong>What to tighten</strong>
        <ul style={{ margin: 0 }}>{evaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </div>
    </>
  );
}
