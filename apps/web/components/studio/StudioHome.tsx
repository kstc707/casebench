"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KNOWN_ROLES } from "@casebench/domain";
import { requireProfile } from "../Profile";
import { Shell } from "../Shell";

interface Mine {
  attempts: number;
  completions: number;
  avgScore: number | null;
  likes: number;
  ratingAvg: number | null;
  id: string;
  slug: string;
  title: string;
  role: string;
  listed: boolean;
  updatedAt: string;
}

/** Studio home: your scenarios, create from a template, or import a file. */
export function StudioHome() {
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("ux-designer");
  const [customRole, setCustomRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/studio/scenarios")
      .then((r) => r.json())
      .then((d: { scenarios?: Mine[] }) => setMine(d.scenarios ?? []))
      .catch(() => setMine([]));
  }, []);

  async function create(body: unknown) {
    setError(null);
    setErrors([]);
    if (!(await requireProfile("Simulations you create are published under this name."))) return;
    const res = await fetch("/api/studio/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { id?: string; error?: string; errors?: string[] };
    if (!res.ok || !data.id) {
      setError(data.error ?? `HTTP ${res.status}`);
      setErrors(data.errors ?? []);
      return;
    }
    location.href = `/studio/${data.id}`;
  }

  async function importFile(file: File) {
    try {
      await create({ import: JSON.parse(await file.text()) });
    } catch {
      setError("That file isn't valid JSON.");
    }
  }

  const chosenRole = role === "other" ? customRole.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : role;

  return (
    <main className="page" style={{ display: "grid", gap: 20 }}>
      <div>

        <h1 style={{ marginBottom: 4 }}>Create a problem</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Create a realistic simulation of any kind of work — data, design, engineering, security, marketing, operations —
          for others to solve. Write the situation, invent the AI coworkers and what each of them knows, set the hidden
          answer key and how it's graded. Play it yourself, share the link, then list it for the community. You'll see
          how many people attempt it, how they score, and what they think.
        </p>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>New scenario</strong>
        <input placeholder="Title, e.g. “Why are users abandoning onboarding?”" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label className="muted">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={selectStyle}>
            {Object.entries(KNOWN_ROLES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
            <option value="other">Other…</option>
          </select>
          {role === "other" && (
            <input style={{ maxWidth: 240 }} placeholder="e.g. marketing analyst" value={customRole} onChange={(e) => setCustomRole(e.target.value)} />
          )}
          <button className="primary" disabled={!chosenRole} onClick={() => create({ role: chosenRole, title })}>
            Create from template
          </button>
          <label className="pill" style={{ cursor: "pointer", padding: "6px 12px" }}>
            Import .json
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </label>
        </div>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
        {errors.length > 0 && (
          <ul className="error" style={{ margin: 0 }}>{errors.slice(0, 15).map((e) => <li key={e}>{e}</li>)}</ul>
        )}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <strong>Your scenarios</strong>
        {mine === null && <p className="muted">Loading…</p>}
        {mine?.length === 0 && <p className="muted">Nothing yet. Scenarios are tied to this browser until accounts exist.</p>}
        {mine?.map((s) => (
          <div key={s.id} className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>{s.title}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                {KNOWN_ROLES[s.role] ?? s.role} · {s.listed ? "listed in Community" : "unlisted (link only)"} · edited{" "}
                {new Date(s.updatedAt).toLocaleString()}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {s.attempts} attempts · {s.completions} finished
                {s.avgScore !== null && ` · avg score ${s.avgScore}`} · ♥ {s.likes}
                {s.ratingAvg !== null && ` · ★ ${s.ratingAvg}`}
              </div>
            </div>
            <Link href={`/studio/${s.id}`}>Edit</Link>
            <Link href={`/problems/${s.slug}`}>Play</Link>
          </div>
        ))}
      </div>
    </main>
  );
}

export const selectStyle: React.CSSProperties = {
  font: "inherit",
  color: "var(--text)",
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "7px 8px",
};
