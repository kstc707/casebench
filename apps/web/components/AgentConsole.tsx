"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProfileChip } from "./Profile";

interface Job {
  id: string;
  status: "running" | "ready" | "failed" | "approved" | "rejected";
  trigger: "cron" | "manual";
  topic: string | null;
  slug: string | null;
  title: string | null;
  plan: { role: string; theme: string; queries: string[] } | null;
  brief: { pattern: string; realExamples: Array<{ summary: string; url: string }>; whyItsHard: string } | null;
  sources: Array<{ title: string; url: string }> | null;
  checks: Array<{ description: string; sql: string; ok: boolean; error?: string }> | null;
  log: string[];
  error: string | null;
  createdAt: string;
}

const STATUS: Record<Job["status"], { label: string; color: string }> = {
  running: { label: "Researching…", color: "var(--accent)" },
  ready: { label: "Needs review", color: "var(--warn)" },
  approved: { label: "Published", color: "var(--good)" },
  rejected: { label: "Rejected", color: "var(--muted)" },
  failed: { label: "Failed", color: "var(--bad)" },
};

/**
 * The author agent's console: start a run (optionally with a topic), watch
 * it work, play the draft, see its sources and the checks it passed, then
 * publish it as CB or reject it.
 */
export function AgentConsole() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/author-agent", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { jobs?: Job[]; error?: string };
    if (!res.ok) setError(data.error ?? `HTTP ${res.status}`);
    else {
      setError(null);
      setJobs(data.jobs ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener("cb:profile-changed", load);
    return () => window.removeEventListener("cb:profile-changed", load);
  }, [load]);

  // Poll while something is running.
  const running = jobs?.some((j) => j.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/author-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    setTopic("");
    setBusy(false);
    await load();
  }

  async function decide(id: string, decision: "approve" | "reject") {
    if (decision === "reject" && !confirm("Delete this draft?")) return;
    await fetch(`/api/author-agent/jobs/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    await load();
  }

  return (
    <main className="page" style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Link href="/">← Casebench</Link>
        <ProfileChip />
      </div>
      <div>
        <h1 style={{ marginBottom: 4 }}>Author agent</h1>
        <p className="muted" style={{ marginTop: 0, maxWidth: 760 }}>
          Researches real-world work problems online (incident write-ups, postmortems, case studies), then designs a
          simulation around one: a fictional company, AI coworkers, a hidden answer key, and data with the real cause
          planted in it. A draft is saved only if SQL checks prove the cause can be found. Drafts are published as{" "}
          <strong>CB</strong> once you approve them. It also runs once a day on its own.
        </p>
      </div>

      {error && <div className="card error">{error}</div>}

      {!error && (
        <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            style={{ flex: "1 1 320px" }}
            placeholder="Optional topic, e.g. “fraud spike after a payment provider change”"
            value={topic}
            maxLength={300}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button className="primary" disabled={busy || !!running} onClick={() => void generate()}>
            {running ? "Agent is working…" : "Generate a simulation"}
          </button>
        </div>
      )}

      {jobs?.length === 0 && <p className="muted">No runs yet.</p>}
      {jobs?.map((j) => (
        <article key={j.id} className="card" style={{ display: "grid", gap: 10 }} data-testid="agent-job">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <strong style={{ fontSize: 16 }}>{j.title ?? j.plan?.theme ?? j.topic ?? "Picking a topic…"}</strong>
            <span className="pill" style={{ borderColor: STATUS[j.status].color, color: STATUS[j.status].color }}>
              {STATUS[j.status].label}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {new Date(j.createdAt).toLocaleString()} · {j.trigger === "cron" ? "daily run" : "on demand"}
            {j.topic && ` · topic: ${j.topic}`}
            {j.plan && ` · role: ${j.plan.role}`}
          </div>

          {j.status === "ready" && j.slug && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="pill" style={{ padding: "6px 12px" }} href={`/problems/${j.slug}`} target="_blank">
                ▶ Play the draft
              </Link>
              <button className="primary" onClick={() => void decide(j.id, "approve")}>Publish as CB</button>
              <button onClick={() => void decide(j.id, "reject")}>Reject</button>
            </div>
          )}
          {j.status === "approved" && j.slug && <Link href={`/problems/${j.slug}`}>Open the published simulation →</Link>}

          {j.brief && (
            <details>
              <summary>Real-world pattern</summary>
              <p style={{ margin: "6px 0" }}>{j.brief.pattern}</p>
              <p className="muted" style={{ margin: "6px 0" }}>Why it's hard: {j.brief.whyItsHard}</p>
              {j.brief.realExamples.map((e) => (
                <p key={e.url} style={{ margin: "4px 0", fontSize: 13 }}>
                  • {e.summary} <a href={e.url} target="_blank" rel="noreferrer">source</a>
                </p>
              ))}
            </details>
          )}
          {j.sources && j.sources.length > 0 && (
            <details>
              <summary>Sources read ({j.sources.length})</summary>
              {j.sources.map((s) => (
                <div key={s.url} style={{ fontSize: 13 }}>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                </div>
              ))}
            </details>
          )}
          {j.checks && (
            <details>
              <summary>Quality checks ({j.checks.filter((c) => c.ok).length}/{j.checks.length} passed)</summary>
              {j.checks.map((c, i) => (
                <div key={i} style={{ fontSize: 13, margin: "6px 0" }}>
                  {c.ok ? "✓" : "✗"} {c.description}
                  <pre className="code" style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{c.sql}</pre>
                </div>
              ))}
            </details>
          )}
          {j.error && <pre className="error" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{j.error}</pre>}
          <details open={j.status === "running"}>
            <summary>Log ({j.log.length})</summary>
            <pre className="code" style={{ whiteSpace: "pre-wrap", margin: "6px 0", fontSize: 12 }}>{j.log.join("\n") || "Starting…"}</pre>
          </details>
        </article>
      ))}
    </main>
  );
}
