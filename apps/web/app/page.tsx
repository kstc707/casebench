import Link from "next/link";
import { getCatalog } from "../lib/problems";
import { metaFor } from "../lib/community";
import { Discover, type DiscoverItem } from "../components/Discover";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await getCatalog();
  const meta = process.env.DATABASE_URL ? await metaFor(catalog.map((c) => c.problem.slug)) : new Map();
  const items: DiscoverItem[] = catalog.flatMap(({ problem: p, source, authorName, createdAt }) => {
    const m = meta.get(p.slug);
    if (!m) return [];
    return [
      {
        slug: p.slug,
        title: p.title,
        category: p.role,
        concepts: p.concepts.map((c) => c.name),
        source,
        authorName,
        createdAt,
        complexity: { score: m.complexity.score, label: m.complexity.label },
        expectedMinutes: m.complexity.expectedMinutes,
        attempts: m.stats.attempts,
        attemptsLast7Days: m.stats.attemptsLast7Days,
        completionRate: m.stats.attempts ? Math.round((100 * m.stats.completions) / m.stats.attempts) : null,
        likes: m.social.likes,
        ratingAvg: m.social.ratingAvg,
        ratingCount: m.social.ratingCount,
      },
    ];
  });

  return (
    <main className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Casebench</h1>
        <Link href="/studio" className="pill" style={{ padding: "6px 12px" }}>
          ✎ Create a simulation
        </Link>
      </div>
      <p className="muted" style={{ maxWidth: 720 }}>
        Create, share, and solve realistic simulations of real work. Don't answer questions about the job — step into a
        situation, work with AI coworkers, and figure out what to do. Then get evaluated against what was actually true.
      </p>
      <Discover items={items} />
    </main>
  );
}
