"use client";

import { useEffect, useRef, useState } from "react";
import { logEvent, submit } from "./api";
import type { DeliverableSection, Submission } from "./types";

/**
 * The deliverable. Drafts are saved to the event log a few seconds after you
 * stop typing (so the manager notices you've started writing), and submitting
 * sends it for grading.
 */
export function WriteUp({
  runId,
  sections,
  initial,
  locked,
  onSubmitted,
  onActivity,
}: {
  runId: string;
  sections: DeliverableSection[];
  initial: Submission | null;
  locked: boolean;
  onSubmitted: () => void;
  onActivity: () => void;
}) {
  const [form, setForm] = useState<Submission>(
    () => Object.fromEntries(sections.map((sec) => [sec.key, initial?.[sec.key] ?? ""]))
  );
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function update(key: string, value: string) {
    const next = { ...form, [key]: value };
    setForm(next);
    setStatus("Unsaved changes");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await logEvent(runId, { type: "submission_drafted", draft: next });
      setStatus("Draft saved");
      onActivity();
    }, 4000);
  }

  async function send() {
    const missing = sections.filter((sec) => sec.required && !form[sec.key]?.trim());
    if (missing.length) {
      setStatus(`Please fill in: ${missing.map((m) => m.label).join(", ")}.`);
      return;
    }
    if (!confirm("Submit your write-up for review? You can't edit it afterwards.")) return;
    if (timer.current) clearTimeout(timer.current);
    setSubmitting(true);
    setStatus("Submitted — your work is being reviewed against what's actually in the data. This can take a minute…");
    try {
      await submit(runId, form);
      onSubmitted();
    } catch (e) {
      setStatus(`Review failed: ${(e as Error).message}. Your submission is saved — press Submit again to retry grading.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="writeup">
      <div>
        <h1 className="doc-title">Your write-up</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {locked ? "Submitted. It's on the Feedback page." : "Drafts save automatically. Your manager reads this, so lead with the answer."}
        </p>
      </div>
      {sections.map((f) => (
        <label key={f.key}>
          {f.label}
          {f.required ? " *" : ""}
          <span>{f.hint}</span>
          <textarea
            rows={f.rows ?? 4}
            value={form[f.key] ?? ""}
            disabled={locked || submitting}
            onChange={(e) => update(f.key, e.target.value)}
          />
        </label>
      ))}
      {!locked && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="primary" onClick={send} disabled={submitting}>
            {submitting ? "Reviewing…" : "Submit for review"}
          </button>
          {status && <span className="muted">{status}</span>}
        </div>
      )}
      {locked && <p className="muted">Submitted. See the Feedback tab.</p>}
    </div>
  );
}
