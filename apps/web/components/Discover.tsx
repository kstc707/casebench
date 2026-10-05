"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KNOWN_ROLES } from "@casebench/domain";
import { ComplexityBadge } from "./Community";

export interface DiscoverItem {
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
  attemptsLast7Days: number;
  completionRate: number | null;
  likes: number;
  ratingAvg: number | null;
  ratingCount: number;
}

type Sort = "trending" | "new" | "top" | "hardest";
const SORTS: Array<[Sort, string]> = [["trending", "🔥 Trending"], ["new", "🆕 New"], ["top", "★ Top rated"], ["hardest", "◆ Hardest"]];

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
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {SORTS.map(([s, label]) => (
          <button key={s} className={`nav-item ${sort === s ? "active" : ""}`} style={{ width: "auto" }} onClick={() => setSort(s)}>
            {label}
          </button>
        ))}
        <input placeholder="Search simulations…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240, marginLeft: "auto" }} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["all", ...categories].map((c) => (
          <button key={c} className={`pill ${category === c ? "active" : ""}`} style={{ cursor: "pointer", borderColor: category === c ? "var(--accent)" : undefined }} onClick={() => setCategory(c)}>
            {c === "all" ? "All categories" : KNOWN_ROLES[c] ?? c}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="muted">Nothing here yet.</p>}
      {shown.map((i) => (
        <Link key={i.slug} href={`/problems/${i.slug}`} className="card" style={{ textDecoration: "none", color: "inherit", display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <strong style={{ fontSize: 16 }}>{i.title}</strong>
            <ComplexityBadge score={i.complexity.score} label={i.complexity.label} />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {KNOWN_ROLES[i.category] ?? i.category} · ~{i.expectedMinutes} min · {i.source === "official" ? "Official" : `by ${i.authorName || "anonymous"}`}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {i.attempts} attempt{i.attempts === 1 ? "" : "s"}
            {i.completionRate !== null && ` · ${i.completionRate}% finished`} · ♥ {i.likes}
            {i.ratingAvg !== null && ` · ★ ${i.ratingAvg} (${i.ratingCount})`}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {i.concepts.map((c) => <span key={c} className="pill">{c}</span>)}
          </div>
        </Link>
      ))}
    </div>
  );
}
