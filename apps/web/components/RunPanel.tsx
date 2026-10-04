"use client";

import { useEffect, useState } from "react";

interface RunSummary {
  id: string;
  status: string;
  createdAt: string;
}

/**
 * Starts or resumes this browser's run for a problem. The workspace tools
 * (data explorer, manager chat, submission) will hang off the active run
 * as they're ported from the prototype.
 */
export function RunPanel({ problemSlug }: { problemSlug: string }) {
  const [run, setRun] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs?problemSlug=${encodeURIComponent(problemSlug)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { runs: RunSummary[] };
      })
      .then((data) => {
        // Resume the latest unpublished run; a published one is finished.
        setRun(data.runs.find((r) => r.status !== "published") ?? null);
      })
      .catch((e: Error) => setError(`Couldn't load your runs (${e.message})`))
      .finally(() => setLoading(false));
  }, [problemSlug]);

  async function start() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemSlug }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { run: created } = (await res.json()) as { run: RunSummary };

      const viewed = await fetch(`/api/runs/${created.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "brief_viewed" }),
      });
      if (!viewed.ok) throw new Error(`HTTP ${viewed.status}`);
      setRun(((await viewed.json()) as { run: RunSummary }).run);
    } catch (e) {
      setError(`Couldn't start a run (${(e as Error).message})`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, margin: "16px 0" }}>
      {loading ? (
        <p>Loading…</p>
      ) : run ? (
        <p>
          Run <code>{run.id.slice(0, 8)}</code> · status <strong>{run.status}</strong> · started{" "}
          {new Date(run.createdAt).toLocaleString()}
        </p>
      ) : (
        <button onClick={start}>Start this problem</button>
      )}
      {error && <p style={{ color: "#b00" }}>{error}</p>}
    </section>
  );
}
