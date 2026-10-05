"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KNOWN_ROLES } from "@casebench/domain";

export interface DiscoverItem {
  /** Tracker-style key, e.g. CASE-3. */
  key: string;
  slug: string;
  title: string;
  category: string;
  concepts: string[];
  source: "official" | "community";
  authorName?: string | null;
  createdAt?: string;
  complexity: { score: number; label: string };
  expectedMinutes: number;
  attempts: number;
  solvers: number;
  attemptsLast7Days: number;
  completionRate: number | null;
  likes: number;
  ratingAvg: number | null;
  ratingCount: number;
}

type Sort = "trending" | "new" | "top" | "hardest";
const SORTS: Array<[Sort, string]> = [["trending", "Trending"], ["new", "Newest"], ["top", "Top rated"], ["hardest", "Hardest"]];

/** Ratings shrink toward 3.5 until there are enough of them (so one 5★ doesn't top the chart). */
const bayes = (avg: number | null, n: number) => ((avg ?? 3.5) * n + 3.5 * 3) / (n + 3);
const trending = (i: DiscoverItem) => i.attemptsLast7Days * 2 + i.likes + (i.ratingCount ? bayes(i.ratingAvg, i.ratingCount) : 0);

export function Discover({ items }: { items: DiscoverItem[] }) {
  const [sort, setSort] = useState<Sort>("trending");
  const [category, setCategory] = useState<string>("all");
  const [q, setQ] = useState("");

  const categories = useMemo(() => [...new Set(items.map((i) => i.category))].sort(), [items]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        (category === "all" || i.category === category) &&
        (!needle || `${i.title} ${i.concepts.join(" ")}`.toLowerCase().includes(needle))
    );
    const by: Record<Sort, (a: DiscoverItem, b: DiscoverItem) => number> = {
      trending: (a, b) => trending(b) - trending(a),
      new: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      top: (a, b) => bayes(b.ratingAvg, b.ratingCount) - bayes(a.ratingAvg, a.ratingCount),
      hardest: (a, b) => b.complexity.score - a.complexity.score,
    };
    return [...list].sort(by[sort]);
  }, [items, sort, category, q]);

  return (
    <div>
      <div className="tabs" role="tablist">
        {SORTS.map(([s, label]) => (
          <button key={s} role="tab" aria-selected={sort === s} className={sort === s ? "active" : ""} onClick={() => setSort(s)}>
            {label}
          </button>
        ))}
      </div>
      <div className="filters">
        <input placeholder="Filter problems…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter problems" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Team">
          <option value="all">All teams</option>
          {categories.map((c) => (
            <option key={c} value={c}>{KNOWN_ROLES[c] ?? c}</option>
          ))}
        </select>
        <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>{shown.length} problem{shown.length === 1 ? "" : "s"}</span>
      </div>
      <div className="issues">
        <div className="issue-row head" aria-hidden>
          <span>Key</span>
          <span>Problem</span>
          <span>Complexity</span>
          <span>Estimate</span>
          <span>Solved</span>
        </div>
        {shown.length === 0 && <p className="muted" style={{ padding: "12px 14px", margin: 0 }}>No problems match.</p>}
        {shown.map((i) => (
          <Link key={i.slug} href={`/problems/${i.slug}`} className="issue-row">
            <span className="issue-key">{i.key}</span>
            <span>
              <div className="issue-title">{i.title}</div>
              <div className="issue-meta">
                <RoleLabel role={i.category} />
                <span>{i.source === "official" ? "Official" : `by ${i.authorName || "anonymous"}`}</span>
                {i.concepts.slice(0, 2).map((c) => (
                  <span key={c} className="concept">· {c}</span>
                ))}
              </div>
            </span>
            <span className="issue-num"><Priority score={i.complexity.score} label={i.complexity.label} /></span>
            <span className="issue-num">{i.expectedMinutes} min</span>
            <span className="issue-num">
              {i.solvers > 0 ? `${i.solvers} ${i.solvers === 1 ? "person" : "people"}` : <span className="muted">—</span>}
              {i.ratingAvg !== null && <div className="muted" style={{ fontSize: 12 }}>★ {i.ratingAvg} · ♥ {i.likes}</div>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const ROLE_COLORS: Record<string, [string, string]> = {
  "data-analyst": ["#e3f2fd", "#0b5394"],
  "data-scientist": ["#ede7f6", "#4527a0"],
  "ux-designer": ["#fce4ec", "#ad1457"],
  "product-manager": ["#fff3e0", "#b45309"],
  "software-engineer": ["#e8f5e9", "#1b5e20"],
  cybersecurity: ["#ffebee", "#b71c1c"],
  marketing: ["#f3e5f5", "#6a1b9a"],
  finance: ["#e0f2f1", "#00695c"],
  operations: ["#eceff1", "#37474f"],
  "customer-support": ["#fffde7", "#795548"],
};

/** A team label, like an issue tracker's. */
export function RoleLabel({ role }: { role: string }) {
  const [bg, fg] = ROLE_COLORS[role] ?? ["#eeeeee", "#444444"];
  return <span className="label" style={{ background: bg, color: fg }}>{KNOWN_ROLES[role] ?? role}</span>;
}

/** Complexity as a priority-style signal: bars + label. */
export function Priority({ score, label }: { score: number; label: string }) {
  const level = score >= 5 ? 3 : score >= 3 ? 2 : 1;
  const color = score >= 7 ? "var(--bad)" : score >= 5 ? "var(--warn)" : score >= 3 ? "var(--accent)" : "var(--good)";
  return (
    <span title={`Complexity ${score}/10`} style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span className={`prio l${level}`} aria-hidden><i /><i /><i /></span>
      {label} <span className="muted" style={{ fontWeight: 400 }}>{score.toFixed(1)}</span>
    </span>
  );
}
