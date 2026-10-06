"use client";

import { useState } from "react";
import Link from "next/link";

type Choice = "yes" | "partly" | "no" | "maybe";

/** The structured feedback form: a few choices, five 1–5 ratings, three open questions. */
export function FeedbackForm({
  personas,
  ratings,
  problems,
  initialProblem,
}: {
  personas: Record<string, string>;
  ratings: Record<string, string>;
  problems: Array<{ slug: string; title: string }>;
  initialProblem: string;
}) {
  const [persona, setPersona] = useState("");
  const [problemSlug, setProblemSlug] = useState(initialProblem);
  const [completed, setCompleted] = useState<Choice | "">("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [wouldUse, setWouldUse] = useState<Choice | "">("");
  const [mostUseful, setMostUseful] = useState("");
  const [confusing, setConfusing] = useState("");
  const [missing, setMissing] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, problemSlug, completed, ratings: scores, wouldUse, mostUseful, confusing, missing, contact }),
      });
      if (res.ok) setSent(true);
      else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Something went wrong (HTTP ${res.status}).`);
    } catch {
      setError("Couldn't reach the server. Try again?");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card feedback-done" role="status">
        <h2 style={{ margin: 0 }}>Thank you!</h2>
        <p style={{ margin: "8px 0 0" }}>
          Your feedback was sent. <Link href="/">Back to problems</Link>
        </p>
      </div>
    );
  }

  const radios = (name: string, value: string, set: (v: any) => void, options: Record<string, string>) => (
    <div className="choices" role="radiogroup">
      {Object.entries(options).map(([v, label]) => (
        <label key={v} className={`choice ${value === v ? "on" : ""}`}>
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => set(v)} />
          {label}
        </label>
      ))}
    </div>
  );

  return (
    <form className="feedback-form" onSubmit={submit}>
      <fieldset>
        <legend>Which describes you best?</legend>
        {radios("persona", persona, setPersona, personas)}
      </fieldset>

      <fieldset>
        <legend>Which problem did you try?</legend>
        <select value={problemSlug} onChange={(e) => setProblemSlug(e.target.value)} aria-label="Problem">
          <option value="">None yet / not sure</option>
          {problems.map((p) => (
            <option key={p.slug} value={p.slug}>{p.title}</option>
          ))}
        </select>
      </fieldset>

      <fieldset>
        <legend>Did you finish a problem and get graded?</legend>
        {radios("completed", completed, setCompleted, { yes: "Yes", partly: "Started, didn't finish", no: "No, just looked around" })}
      </fieldset>

      <fieldset>
        <legend>Rate each from 1 (poor) to 5 (great)</legend>
        <div className="ratings">
          {Object.entries(ratings).map(([key, label]) => (
            <div key={key} className="rating-row">
              <span id={`r-${key}`}>{label}</span>
              <div className="scale" role="radiogroup" aria-labelledby={`r-${key}`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    key={n}
                    role="radio"
                    aria-checked={scores[key] === n}
                    aria-label={`${n}`}
                    className={scores[key] === n ? "on" : ""}
                    onClick={() => setScores((s) => ({ ...s, [key]: n }))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Would you use Casebench to prepare for a job?</legend>
        {radios("wouldUse", wouldUse, setWouldUse, { yes: "Yes", maybe: "Maybe", no: "No" })}
      </fieldset>

      <label className="open">
        What was most useful or interesting?
        <textarea rows={3} maxLength={2000} value={mostUseful} onChange={(e) => setMostUseful(e.target.value)} />
      </label>
      <label className="open">
        What was confusing, unrealistic or broken?
        <textarea rows={3} maxLength={2000} value={confusing} onChange={(e) => setConfusing(e.target.value)} />
      </label>
      <label className="open">
        What's missing? What would make you come back?
        <textarea rows={3} maxLength={2000} value={missing} onChange={(e) => setMissing(e.target.value)} />
      </label>
      <label className="open">
        How can I follow up with you? <span className="muted">(optional: a name, LinkedIn, or email)</span>
        <input maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
      </label>

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      <div>
        <button className="primary" type="submit" disabled={busy || !persona || !completed || !wouldUse || Object.keys(scores).length === 0}>
          {busy ? "Sending…" : "Send feedback"}
        </button>
        <span className="muted" style={{ marginLeft: 12, fontSize: 13 }}>Required: the three choice questions and at least one rating.</span>
      </div>
    </form>
  );
}
