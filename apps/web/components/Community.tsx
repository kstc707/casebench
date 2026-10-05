"use client";

import { useCallback, useEffect, useState } from "react";

interface Complexity {
  score: number;
  label: string;
  dimensions: { investigation: number; ambiguity: number; technical: number; scope: number; time: number };
  observedWeight: number;
  expectedMinutes: number;
  minutesFromSolvers: boolean;
}
interface CommunityData {
  complexity: Complexity;
  stats: { attempts: number; completions: number; avgScore: number | null; avgMinutes: number | null };
  social: { likes: number; ratingAvg: number | null; ratingCount: number };
  viewer: { liked: boolean; myRating: number | null; finished: boolean };
  comments: Array<{ id: string; authorName: string; body: string; createdAt: string; mine: boolean; authorFinished: boolean }>;
}

const DIMENSIONS: Array<[keyof Complexity["dimensions"], string]> = [
  ["investigation", "Investigation depth"],
  ["ambiguity", "Ambiguity"],
  ["technical", "Technical"],
  ["scope", "Deliverable scope"],
  ["time", "Time"],
];

export function ComplexityBadge({ score, label }: { score: number; label: string }) {
  const color = score >= 7 ? "var(--bad)" : score >= 5 ? "var(--warn)" : score >= 3 ? "var(--accent)" : "var(--good)";
  return (
    <span className="pill" style={{ borderColor: color, color }} title={`Complexity ${score}/10 · ${label}`}>
      ◆ {score.toFixed(1)} {label}
    </span>
  );
}

/**
 * The community panel for one simulation: complexity breakdown, how solvers
 * did, like, rate (after finishing), and comments.
 */
export function Community({ slug, showRatePrompt }: { slug: string; showRatePrompt?: boolean }) {
  const [data, setData] = useState<CommunityData | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/simulations/${slug}`);
    if (res.ok) setData((await res.json()) as CommunityData);
  }, [slug]);

  useEffect(() => {
    void load();
    try {
      setName(localStorage.getItem("cb_display_name") ?? "");
    } catch {
      // storage unavailable — fine
    }
  }, [load]);

  async function post(path: string, payload: unknown, method = "POST") {
    setError(null);
    const res = await fetch(`/api/simulations/${slug}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    await load();
    return res.ok;
  }

  async function comment() {
    try {
      localStorage.setItem("cb_display_name", name);
    } catch {
      // ignore
    }
    if (await post("/comments", { name, body })) setBody("");
  }

  if (!data) return <div className="card muted">Loading community…</div>;
  const { complexity: c, stats, social, viewer } = data;
  const completion = stats.attempts ? Math.round((100 * stats.completions) / stats.attempts) : null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <ComplexityBadge score={c.score} label={c.label} />
          <span className="muted">
            ~{c.expectedMinutes} min{c.minutesFromSolvers ? " (from solvers)" : " (creator's estimate)"}
            {c.observedWeight > 0 && ` · score ${Math.round(c.observedWeight * 100)}% from solver results`}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => post("/like", { liked: !viewer.liked })} aria-pressed={viewer.liked}>
              {viewer.liked ? "♥" : "♡"} {social.likes}
            </button>
            <span className="muted">
              {social.ratingAvg !== null ? `★ ${social.ratingAvg} (${social.ratingCount})` : "No ratings yet"}
            </span>
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {DIMENSIONS.map(([k, label]) => (
            <div key={k}>
              <div className="muted" style={{ fontSize: 12 }}>{label} · {c.dimensions[k]}</div>
              <div className="bar"><div style={{ width: `${c.dimensions[k] * 10}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          {stats.attempts} attempt{stats.attempts === 1 ? "" : "s"}
          {completion !== null && ` · ${completion}% finished`}
          {stats.avgScore !== null && ` · average score ${stats.avgScore}/100`}
          {stats.avgMinutes !== null && stats.avgMinutes >= 3 && ` · average ${stats.avgMinutes} min`}
        </div>
      </div>

      {(showRatePrompt || viewer.finished) && (
        <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>{viewer.myRating ? "Your rating" : "Rate this simulation"}</strong>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => post("/rating", { stars: n })}
              style={{ color: (viewer.myRating ?? 0) >= n ? "var(--warn)" : "var(--muted)" }}
            >
              ★
            </button>
          ))}
        </div>
      )}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>Discussion ({data.comments.length})</strong>
        <div style={{ display: "grid", gap: 6 }}>
          <input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 240 }} />
          <textarea
            rows={2}
            placeholder={viewer.finished ? "How did you approach it? (avoid spoiling the answer)" : "Questions or thoughts? (no spoilers please)"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button className="primary" style={{ justifySelf: "start" }} disabled={!name.trim() || !body.trim()} onClick={comment}>
            Post comment
          </button>
        </div>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
        {data.comments.map((cm) => (
          <div key={cm.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ fontSize: 13 }}>
              <strong>{cm.authorName}</strong>
              {cm.authorFinished && <span className="pill" style={{ marginLeft: 6, fontSize: 11 }}>✓ solved it</span>}
              <span className="muted"> · {new Date(cm.createdAt).toLocaleDateString()}</span>
              {cm.mine && (
                <button style={{ marginLeft: 8, padding: "0 6px", fontSize: 12 }} onClick={() => post(`/comments?id=${cm.id}`, undefined, "DELETE")}>
                  delete
                </button>
              )}
            </div>
            <div className="msg-text">{cm.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
