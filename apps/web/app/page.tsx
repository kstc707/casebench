import Link from "next/link";
import { KNOWN_ROLES } from "@casebench/domain";
import { getCatalog, type CatalogEntry } from "../lib/problems";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const catalog = await getCatalog();
  const official = catalog.filter((c) => c.source === "official");
  const community = catalog.filter((c) => c.source === "community");

  return (
    <main className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Casebench</h1>
        <Link href="/studio" className="pill" style={{ padding: "6px 12px", textDecoration: "none" }}>
          ✎ Scenario Studio — create your own
        </Link>
      </div>
      <p className="muted">
        Practice the job before you have the job. Work a realistic assignment while AI coworkers message you on Slack,
        then get graded against what's actually true.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Official simulations</h2>
      <Grid entries={official} />

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Community scenarios</h2>
      {community.length ? (
        <Grid entries={community} />
      ) : (
        <p className="muted">
          None yet. <Link href="/studio">Create one in the Studio</Link> — any role, any company.
        </p>
      )}
    </main>
  );
}

function Grid({ entries }: { entries: CatalogEntry[] }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {entries.map(({ problem: p, authorName, source }) => (
        <Link key={p.slug} href={`/problems/${p.slug}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 16 }}>{p.title}</strong>
            <span className="muted">
              {KNOWN_ROLES[p.role] ?? p.role} · {p.difficulty} · ~{p.estimatedMinutes} min
            </span>
          </div>
          {source === "community" && <div className="muted" style={{ fontSize: 12 }}>by {authorName || "anonymous"}</div>}
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {p.concepts.map((c) => (
              <span key={c.name} className="pill">{c.name}</span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
