import Link from "next/link";
import { getProblemsForDashboard } from "../lib/problems";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const problems = await getProblemsForDashboard();

  return (
    <main className="page">
      <h1 style={{ marginBottom: 4 }}>Casebench</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Practice the job before you have the job. Work a realistic assignment with messy data while AI
        coworkers message you on Slack, then get graded against what's actually true in the data.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
        {problems.length === 0 && (
          <p className="muted">No problems found under content/role-packs.</p>
        )}
        {problems.map((p) => (
          <Link key={p.slug} href={`/problems/${p.slug}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 16 }}>{p.title}</strong>
              <span className="muted">
                {p.role} · {p.difficulty} · ~{p.estimatedMinutes} min
              </span>
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {p.concepts.map((c) => (
                <span key={c.name} className="pill">{c.name}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
